# Sync

Status: proposed design, open for discussion. Alternatives are at the end.

## Requirements

- Every device works fully offline. Writes never wait on the network.
- All devices end up with identical data once they have synced. Sync order, retries, and duplicate deliveries don't change the end result.
- A device can be offline for weeks, then sync.
- Each account syncs only its own data, across a few devices. Accounts never share rows. Edits to the same row on two devices between syncs are possible but rare.
- The server data is readable by the CLI and usable for backups without app logic.

## Model

Each row of a synced table is one **LWW register**: a value plus an HLC. To
merge two versions of a row, keep the one with the greater HLC. Devices apply
only that rule. The server doesn't merge at all; it only stores and orders
changes.

The rule makes sync safe to run in any order:

- **Commutative.** `merge(a, b) = merge(b, a)`, so the order changes arrive in doesn't matter.
- **Associative.** Grouping doesn't matter, so changes can be batched and paged arbitrarily.
- **Idempotent.** `merge(a, a) = a`, so retries and duplicate deliveries are harmless.

Therefore, if every change eventually reaches every device, all devices
converge to the same state. The protocol only has to deliver every change at
least once, and that is easy to get right.

### Granularity

LWW applies per row, not per field. The cost: if the same row is edited
offline on two devices, e.g. an exercise's name on the phone and its notes on
the web, one of the two edits is lost.

Hot paths avoid this by design. Each set, session exercise, and measurement is
its own row, so logging on two devices at once creates different rows and both
are kept.

If row granularity ever bites, the fix is per-column HLCs. That is what Evolu
and cr-sqlite do, and the protocol shape stays the same.

### HLC

An HLC is serialized as a fixed-width string that sorts correctly as text:

```
<wall ms, 15 digits>-<counter, 5 digits>-<device id>
000001762780000000-00000-k3j9x2
```

The device id is a random string generated at install. It makes every HLC
unique and breaks ties deterministically.

Clock rules:

- **Local write:**
  - `wall = max(prev.wall, now())`
  - `counter = (wall == prev.wall) ? prev.counter + 1 : 0`
- **Receiving a remote HLC `r`:**
  - `wall = max(prev.wall, r.wall, now())`
  - Bump the counter the same way.

  This guarantees that a device's next local edit wins over everything it has already seen, even if its own clock is behind.
- The last issued HLC is persisted, so it survives restarts.

The server rejects changes whose wall time is more than 1 h ahead of server
time. Without that check, a phone with a badly wrong clock could win every
conflict for days. The app shows a clock warning when this happens.

## Client side

Each synced table has these columns:

```
id       TEXT PRIMARY KEY   -- UUIDv7, or deterministic UUIDv5 (see "Duplicates")
hlc      TEXT NOT NULL
deleted  INTEGER NOT NULL DEFAULT 0
...domain columns
```

Two internal tables are local only and never synced:

```
_outbox      (table_name, id, hlc, PRIMARY KEY (table_name, id))
_sync_state  (key PRIMARY KEY, value)   -- device_id, cursor, last_hlc, last_sync_at
```

### Write path

Writes always go through `core`. In one SQLite transaction:

1. `hlc = clock.now()`.
2. Upsert the domain row with that `hlc`. A delete sets `deleted = 1`; rows are never removed.
3. Upsert `_outbox (table_name, id, hlc)`.

If the app dies mid-write, the transaction rolls back. A committed write always has an outbox entry.

### Push

1. Read up to N outbox entries and join them with the current row data.
2. Send `POST /push { device_id, changes: [{ table, id, hlc, deleted, v, data }] }`.
3. On a 2xx response, delete the outbox entries whose `hlc` equals the `hlc` that was sent. If the row was edited again during the request, its outbox entry has a newer HLC and stays for the next push.
4. Repeat until the outbox is empty.

### Pull

1. Send `GET /pull?after=<cursor>&limit=1000`. The response is `{ changes, cursor, more }`.
2. Apply the page in one transaction:
   - For each change, call `clock.receive(change.hlc)`.
   - If there is no local row, or `change.hlc > local.hlc`, overwrite the local row, including `deleted`. Also drop any outbox entry for that row, since its local edit lost the merge.
   - Otherwise skip the change. This covers echoes of this device's own pushes (equal HLC) and changes that an existing edit already beats.
   - Store the new cursor in the same transaction. A crash replays the page at worst, which is idempotent.
3. Repeat while `more` is true.

### When it runs

- On app start and on resume.
- 3 s after the last local write, while online.
- Every 60 s while the app is open.
- On manual "sync now".

Each run pushes first, then pulls. The order doesn't affect correctness; pushing first just makes the round trip shorter. No background sync is needed on Android.

### Referential integrity

Synced tables don't enforce foreign keys. Changes can arrive child-before-parent across pages, and a parent can be deleted on one device while a child is added on another.

Queries join through parents and drop children whose parent is missing or deleted. Deleting a parent also marks its children deleted in the same transaction.

## Server side

The sync part of the server is a few hundred lines with one table. Auth and
quotas are in [accounts.md](accounts.md).

```
change (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,   -- global, increasing
  user_id     TEXT NOT NULL,
  table_name  TEXT NOT NULL,
  id          TEXT NOT NULL,
  hlc         TEXT NOT NULL,
  deleted     INTEGER NOT NULL,
  v           INTEGER NOT NULL,      -- schema version of data
  data        TEXT NOT NULL,         -- JSON
  device_id   TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  UNIQUE (user_id, table_name, id, hlc)
)
INDEX (user_id, seq)
```

All endpoints require a bearer token and act only on the token's `user_id`.

- `POST /push`: check quotas, then `INSERT OR IGNORE` each change in one transaction. The unique key makes retries no-ops. The server does not merge.
- `GET /pull?after=&limit=`: `SELECT ... WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?`.
  - `seq` is global, so one user's cursor skips over the numbers used by other users. That is harmless, because a cursor only needs to increase.
- `GET /snapshot`: the latest change per `(table_name, id)` by HLC, i.e. the current state, plus the max `seq` as a starting cursor. A new device can use this instead of replaying the whole log.

### Why an append-only log

- Pull needs a total order of arrival anyway. An `seq` on an append-only table gives that for free.
- The log is the full history, so the server can restore any point in time. This is the main protection against a bad edit or a buggy client version spreading to all devices. See [backups.md](backups.md).
- Size is small. A set row is about 300 bytes of JSON, so 100k changes are roughly 30 MB. With several users, the D1 500 MB per-database limit matters, which is why per-user size quotas exist. Compaction (keeping only the latest change per row older than N months) is possible later and not needed now.

## Semantic conflicts

LWW guarantees convergence, but the converged result can still be wrong. These cases need handling:

| Case | Handling |
| --- | --- |
| The same entity is created on two offline devices (e.g. built-in exercises seeded on both) | Use deterministic ids wherever an entity has a natural key: UUIDv5 of the built-in key, of the FitNotes row id, or of the Health Connect record id. Both devices then write the same row id and LWW collapses them. Real user-created duplicates are rare; a merge tool comes later if needed. |
| Concurrent reordering or inserting at the same position | `position` is a fractional index string, not an integer. Candidate library: `fractional-indexing`. Inserts never renumber siblings, so they never conflict. |
| A row is edited after it was deleted elsewhere | The greater HLC wins. If that is the edit, the row comes back. Acceptable for one user. |
| The same session is open on two devices | Each set is its own row, so all sets are kept. Session fields such as `ended_at` are LWW. Idle auto-end is deterministic, so every device computes the same value. |
| Uniqueness rules (e.g. exercise names) | Not enforced in the database. The UI warns. |

## Schema evolution

- Each change carries `v`, the app schema version that wrote it. The server stores `v` and `data` verbatim and never needs a migration.
- A client upgrades rows with an older `v` on apply, using the same migration functions it runs on its local tables.
- A client receiving a `v` newer than it understands pauses sync and shows "update the app". It does not apply or drop the change.

## Failure modes

| Failure | Result |
| --- | --- |
| Network drops mid-push | Outbox entries are unacknowledged and are re-sent. The server ignores duplicates. |
| Crash mid-pull | The page transaction rolls back, and the cursor is unchanged. The page is re-pulled. |
| Device offline for weeks | The outbox grows and is pushed later. The pull pages through everything missed. |
| Wrong device clock (too far ahead) | Push rejected, warning shown. Clocks that are behind are handled by the HLC receive rule. |
| App data wiped on a device | Fresh device: new device id, pull a snapshot. Unpushed outbox entries are lost, so the UI shows "unsynced changes" prominently. |
| Server data lost | Every device still has the full state. Re-push everything: there is a "re-upload all" action that marks every row as outbox. |
| Quota exceeded | Push gets a 429. The outbox keeps the changes, local use continues, and the UI shows the reason. Changes push after the reset or after the owner raises the quota. |
| Token revoked or expired | The app asks to log in again. The outbox is kept. |

## Alternatives considered

| Option | Fit | Reason not chosen (for now) |
| --- | --- | --- |
| **Evolu** | Closest match. SQLite on the client, per-column LWW with HLC, stateless relay that can run on Cloudflare Workers, end-to-end encrypted, MIT licensed. Its identity is a key/mnemonic per user, and with several users its encryption becomes a real privacy plus. | Data is encrypted on the relay, so server-side backups, restores, and the CLI must be full Evolu clients holding the user's key. Identity is a mnemonic, not a login, so it doesn't fit the invite/quota model directly. The schema and query API are Evolu's. The API has changed across major versions. **Worth a spike if you'd rather not own the sync code.** |
| **TinyBase** MergeableStore + Durable Object SQL persister | Built-in CRDT sync over WebSocket, first-class Cloudflare Durable Object support. | Keeps the whole dataset in an in-memory store. Queries use TinyBase's API instead of SQL, which hurts analytics. |
| **cr-sqlite** | Column-level CRDT as a SQLite extension, which would let us keep plain SQL. | Maintenance activity is unclear, and packaging is split between original and community forks. |
| **PowerSync / ElectricSQL / Zero** | Mature sync engines. | All require a Postgres backend plus a sync service. Too much infrastructure for one user. |

Recommendation: the custom protocol above. It is small (a clock, an outbox,
two endpoints) and every part of it can be tested in isolation. The server data
stays plain JSON rows that the CLI and backups can read directly.

Before writing it, we could do a half-day Evolu spike. If Evolu's encryption
and API are acceptable, adopting it is the library-first choice.
