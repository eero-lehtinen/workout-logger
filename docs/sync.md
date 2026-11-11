# Sync

Status: decided, custom protocol. The alternatives considered are at the end.

## Requirements

- Every device works fully offline. Writes never wait on the network.
- All devices end up with identical data once they have synced. Sync order, retries, and duplicate deliveries don't change the end result.
- A device can be offline for weeks, then sync.
- Each account syncs only its own data, across a few devices. Accounts never share rows. Edits to the same row on two devices between syncs are possible but rare.
- The server data is readable by the CLI and usable for backups without app logic.

## Model

Each row of a synced table is one **LWW register**: a value plus an HLC. To
merge two versions of a row, keep the one with the greater HLC.

The rule makes sync safe to run in any order:

- **Commutative.** `merge(a, b) = merge(b, a)`, so the order changes arrive in doesn't matter.
- **Associative.** Grouping doesn't matter, so changes can be batched and paged arbitrarily.
- **Idempotent.** `merge(a, a) = a`, so retries and duplicate deliveries are harmless.

Therefore, if every change eventually reaches every device, all devices
converge to the same state. The protocol only has to deliver every change at
least once.

The server keeps the newest version of each row, numbered in the order it
arrived, which is all delivery needs. History lives in backups and snapshot
files, not in the sync tables ([backups.md](backups.md)).

### Granularity

LWW applies per row, not per field. The cost: if the same row is edited
offline on two devices, e.g. an exercise's name on the phone and its notes on
the web, one of the two edits is lost.

Hot paths avoid this by design. Each set, session exercise, and measurement is
its own row, so logging on two devices at once creates different rows and both
are kept.

If row granularity ever bites, the upgrade is per-column HLCs. `data` stays a
flat JSON object of columns, so a column-to-HLC map can be added later
without changing the protocol shape.

### HLC

Format: a fixed-width string that sorts correctly as text.

```
<wall ms, 15 digits>-<counter, 5 digits>-<node id>
001762780000000-00000-k3j9x2
```

- **Node id.** A random device id generated at install (12 hex characters), or a fixed *pseudo-node* for deterministic writes: `seed`, `hc` (Health Connect), `fitnotes`, `restore`, `fix` (data fixes, see [migrations.md](migrations.md#data-fixes)). Node ids are unique per writer, so HLCs are unique and ties never happen between different writers.
- **Validation.** The server checks the format with a strict regex (`^\d{15}-\d{5}-[0-9a-z]{1,16}$`) and rejects anything else.

Clock rules. `l` is the last issued HLC and `now` is `Date.now()`.

- **Local write:**
  - `wall = max(l.wall, now)`
  - `counter = (wall == l.wall) ? l.counter + 1 : 0`
- **Receive remote `r`:**
  - `wall = max(l.wall, r.wall, now)`
  - `counter`:
    - if `wall` equals both `l.wall` and `r.wall`: `max(l.counter, r.counter) + 1`
    - if it equals only `l.wall`: `l.counter + 1`
    - if it equals only `r.wall`: `r.counter + 1`
    - otherwise: `0`
- **Counter overflow** (> 99999): advance `wall` by 1 ms and reset the counter to 0.
- **Persistence.** The clock state (`last_hlc`) is read and updated inside each write transaction, so it survives restarts and can never go backwards.
- **Write guard.** A local write stamps `max(clock.now(), row.hlc⁺)`, where `x⁺` is `x` with the counter incremented. A local edit therefore always beats the version it edits, even if that version came from a node whose clock was ahead. It is computed as `clock.receive(row.hlc)`, which yields the same order. Pulls already move the clock past every received HLC; the guard matters for rows the clock never observed: deterministic writes, whose HLCs come from their source, and rows written before a clock repair.
- **Future clocks.** The server rejects a *single change* whose wall is more than 1 h ahead of server time; the rest of the batch is still accepted. Settings shows a clock warning and offers "repair clock" (`repairClock` in `core`). Once the device's clock is right, it pulls `last_hlc` back to `now + 1 h - 5 min`, just under the server's limit, or to `accepted_hlc` if that is higher, re-stamps each queued row above that from there, and syncs. Not back to `now`: the re-stamped edit must still beat the version it replaced, which the device no longer has. Every version the server accepted had a wall at most 1 h ahead of it, and `accepted_hlc`, the newest HLC this device pushed successfully or pulled, covers the versions it knows of within the 5 min margin, including its own.

## Client side

Each synced table has these columns:

```
id       TEXT PRIMARY KEY   -- UUIDv7, deterministic UUIDv5 (see "Deterministic writes"), or the key of a setting row
hlc      TEXT NOT NULL
deleted  INTEGER NOT NULL DEFAULT 0
...domain columns
```

Three internal tables are local only and never synced:

```
_outbox      (table_name, id, PRIMARY KEY (table_name, id))
_sync_state  (key PRIMARY KEY, value)   -- device_id, server_epoch, cursor, last_hlc, accepted_hlc, last_sync_at, user_id
_undo        (seq, tx, table_name, id, previous)   -- previous row versions, see features.md#data
```

`_sync_state` must never be restored onto another device. Android Auto Backup
is disabled (`allowBackup=false`) so that a device id can't be cloned.

### Write path

Writes always go through `core` (`Store.write`). In one SQLite transaction:

1. Stamp the HLC per the write guard.
2. Upsert the domain row. A delete sets `deleted = 1`; rows are never removed.
3. Upsert `_outbox (table_name, id)`.
4. Record the previous row version in `_undo`, unless the write is marked not undoable.

After commit, the store notifies subscribers of the tables the transaction
changed. Sync applies emit the same events.

Deletes don't cascade. Deleting a session writes only the session's tombstone.
Its exercises and sets remain, and queries hide children of deleted parents.
This means:

- undoing a delete brings back the whole subtree;
- a concurrent edit to a deleted parent can't revive a parent with half its children.

### Push

1. In one transaction, take up to 500 outbox entries joined with their current rows, and at most 1 MB of JSON less 4 KB for the envelope: the server answers 413 to a larger body. `hlc` comes from the row. A single row over that size stays queued and is reported as `too_large`; the rest of the outbox still goes. Entries with nothing to send, a missing row or a table this version doesn't sync, are dropped.
2. Send `POST /api/sync/v1/push { device_id, client_version, changes: [{ table, id, hlc, deleted, v, data }] }`. `data` is a flat JSON object of the row's domain columns.
3. The response is `{ epoch, results }`, with a status per change: `ok` (inserted or a duplicate), or `rejected` with a reason (`invalid`, `future_clock`, `conflict`, `quota`, `schema_outdated`).
4. If no epoch is stored yet, store the response's `epoch`. A known epoch is never replaced here; the next pull compares it.
5. Delete outbox entries that are `ok` and whose row `hlc` still equals the sent `hlc`. If the row was edited during the request, its entry stays and the new version goes in the next push.
6. Rejected entries stay in the outbox and the UI shows the reason. The run's next batch skips past them. A `quota` rejection ends the push for this run.

Step 4 matters for a device that pushes before it ever pulls, e.g. on its
first sync. Without a stored epoch it couldn't notice a server restore that
lost the changes it just removed from its outbox.

### Pull

1. Send `GET /api/sync/v1/pull?after=<cursor>&limit=1000`. The response is `{ epoch, changes, cursor, more }`; each change also carries its `seq`.
2. If `epoch` differs from the stored `server_epoch`, the server was restored. Run [epoch reset](#server-restore-and-epoch) and stop this pull.
3. Apply the page in one transaction:
   - Call `clock.receive` with the page's max HLC.
   - For each change:
     - if there is no local row, or `change.hlc > local.hlc`, overwrite the local row (including `deleted`) and drop the row's outbox entry, because its local edit lost. Also drop the undo entries of every local transaction that touched the row: undoing them would overwrite the winning version;
     - otherwise skip it. This covers echoes of this device's own pushes and older versions.
   - Rows with `v` newer than the client supports are not applied. Sync pauses with "update the app", and the cursor stops at the `seq` before the first such change.
   - Store the new cursor in the same transaction.
4. Repeat while `more` is true.

### Bootstrap

A new device (no cursor yet) calls `GET /api/sync/v1/snapshot`. The response
holds the head rows and the max `seq`, both read in one server transaction. The
device applies them as a pull page and stores that `seq` as its cursor. If the
device already stored a different epoch from an earlier push, it runs the
epoch reset instead. A snapshot with any row newer than the client supports is
not applied at all.

### When it runs

- On app start, on resume (the page becoming visible, or Capacitor's `resume`), and when the browser comes back online.
- 3 s after the last local write, while signed in. A write during a run can't be told apart from the run's own writes, so after a run the app compares the outbox with what the server refused, and runs again 3 s later if more is queued. A run stopped by `quota` doesn't, and waits for the next poll.
- Every 60 s while the app is open and visible. A hidden page or a backgrounded app syncs when it comes back.
- Right after signing in, and on manual "sync now".

Each run pushes first, then pulls (`syncOnce` in `core`). An epoch reset
during the run starts it over, at most twice; a third fails the run. Later, a server-sent-events "poke" with
the latest `seq` can replace polling. Pull stays the source of truth.

The run happens in the DB worker (`syncOverHttp`), next to the database, so
no rows cross to the main thread. The main thread (`lib/sync.ts` in the web
app) decides when to run and passes the credentials: nothing on the web, where
the session cookie goes along, and the bearer token on Android. HTTP 401 means
the session ended: the app asks to sign in again and keeps the outbox. HTTP 426
means the Android app is below the server's minimum version. HTTP 429 is a rate limit, or the snapshot limit: the run fails and the next one tries again; a 429 `quota` on a snapshot shows as the quota pause. HTTP 403 `account_disabled` *(phase 11)* stops sync until the owner enables the account. Every request also names the account the device's data belongs to (`X-Expected-User`); the server answers 409 when the session is another account's, e.g. after a sign-in in another tab, and the app checks the account again before the next run.

Each write of a run checks that the device is still bound to the run's
account, and each pull or snapshot page that the cursor is still the one it
was requested from. Otherwise it writes nothing and the run stops as
`interrupted`, and the app runs again. This keeps a run that waited on the
network from applying the previous account's pages after a merge or discard,
or moving the cursor of an overlapping run past changes it never applied.

### Accounts on a device

`_sync_state.user_id` records which account the device's data belongs to. It
stays after logout. Before a run, the app compares it with the signed-in user
(`matchAccount`):

- no account yet: bind the device (`adoptAccount(..., "keep")`) once the server has confirmed the account, not to a cached one; its outbox already holds every row, so all of it uploads;
- the same account: sync;
- another account: wait for the user's choice, asked on whatever screen is open ([accounts.md](accounts.md#without-an-account)). `merge` queues every row and clears the epoch and cursor, so the device uploads everything and bootstraps from the new account. `discard` first saves a snapshot file of the device (and doesn't discard if that fails), then deletes the synced rows, the outbox, and the undo history, and clears the epoch and cursor; the app re-seeds the catalog. This is the only place synced rows are removed on a device, and no tombstones are written: the rows belong to the other account, which keeps them.

### Referential integrity

Synced tables don't enforce foreign keys. Changes can arrive child-before-parent
across pages. Queries join through parents and drop children whose parent is
missing or deleted.

### Ordering

`position` columns are fractional index strings from `fractional-indexing`.
Ties between equal keys, which concurrent inserts can produce, are broken by
`id`. Every ordered query uses `ORDER BY position, id`; in code, `compareOrder`
in `core` does the same.

## Deterministic writes

Seeds and imports must not overwrite user edits, and the same import on two
devices must produce identical changes. For these writes, both the id and the
HLC are derived from the source:

| Source | id | HLC wall | Node |
| --- | --- | --- | --- |
| Built-in catalog (muscles, exercises, body weight metric) | UUIDv5(`muscle:<key>`, `exercise:<key>`, `exercise_muscle:<exercise key>:<muscle key>`, `metric:<key>`) | `CATALOG_WALL`, fixed at 2026-11-10; the counter is `CATALOG_REVISION` | `seed` |
| Health Connect record (phase 8) | UUIDv5(HC record id) | Record's last-modified time | `hc` |
| FitNotes import | UUIDv5(FitNotes natural key; see [fitnotes-import.md](fitnotes-import.md#ids)) | Conversion time; see [fitnotes-import.md](fitnotes-import.md#importing) | `fitnotes` |

Each source has its own fixed UUIDv5 namespace (`ID_NAMESPACES` in `core`), so
keys from different sources can't collide. The namespaces never change.
Deterministic rows are written with their source's HLC, with counter 0 except
for the catalog.

FitNotes rows are made by the conversion script and reach the device as a
snapshot file, through Import snapshot: Merge applies them with plain LWW, so
a newer conversion overwrites edits made in the app, and Replace re-stamps
them with the device's clock ([fitnotes-import.md](fitnotes-import.md#importing)).

The catalog seed, and later the Health Connect import, write through
`writeDeterministic`, which is not undoable. The rules:

- The writer skips rows whose local HLC is greater than or equal to the HLC it would write, and rows last written by any other node than its own pseudo-node. A user edit or delete survives re-seeding and re-reading Health Connect even if the source's HLC is newer.
- The catalog's wall never moves, so a user's edit of a built-in, stamped later, beats every catalog revision under LWW too: a device that seeds a new revision before pulling the edit loses to the edit when it syncs.
- Two devices importing the same Health Connect record produce byte-identical changes. The server stores one and ignores the other.

## Server side

The sync part of the server is a few hundred lines. It lives in `core`
(`@workout-logger/core/sync-server`), so the fuzz test runs the same code as
the server: push, pull, snapshot, `newEpoch`, and the migration steps that
create the tables below. Each function takes the authenticated `user_id`. Auth and
quotas are in [accounts.md](accounts.md).

```
head (
  user_id     TEXT NOT NULL,
  table_name  TEXT NOT NULL,
  id          TEXT NOT NULL,
  hlc         TEXT NOT NULL,
  deleted     INTEGER NOT NULL,
  v           INTEGER NOT NULL,      -- schema version of data
  data        TEXT NOT NULL,         -- canonical JSON object of columns
  seq         INTEGER NOT NULL,      -- when this version arrived
  device_id   TEXT NOT NULL,         -- who sent this version, and when
  received_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, table_name, id)
) WITHOUT ROWID
INDEX head (user_id, seq)

server_meta (key PRIMARY KEY, value)   -- epoch; seq, the last number handed out;
                                       -- epoch_started_at
user_sync (user_id PRIMARY KEY, max_v)
```

`head` is a `WITHOUT ROWID` table, so its rows live in the primary-key index
instead of being stored a second time.

All endpoints act only on the authenticated `user_id`.

- **`POST /push`** runs in one transaction. For each change, in order:
  1. Validate the shape (table name, id, `v`, `data` a flat object of scalars) and reject anything else as `invalid`. Validate the HLC format and the future-clock bound.
  2. Compare with the stored version of the row, if any:
     - the same HLC, with the same `deleted` and identical `data` or a different `v`: `ok` (duplicate). `data` is stored as canonical JSON (sorted keys), so equal objects compare equal. A different `v` is the same row version rewritten by a client migration, which keeps HLCs; this happens on re-uploads after an epoch reset or a lost push response;
     - the same HLC otherwise: `conflict`, which means a node-id or determinism bug;
     - an older HLC: `ok`, and nothing is stored. The version has already lost: every device that pulls gets the newer one. Retries of a superseded push land here.
  3. If `v < user_sync.max_v`, reject it as `schema_outdated`: an older app would reset columns it doesn't know.
  4. If it doesn't fit the quota, reject it and every newer version after it in the push as `quota`. Duplicates and older versions don't count, so they are still `ok`. The server passes a quota hook (`PushQuota`) that reads the user's allowance in bytes before the first change and records the bytes written after the last, inside the push transaction; without one, as in the fuzz test, there is no limit. A version costs the UTF-8 size of its `data` toward the daily allowance, and its size less the replaced version's toward the storage one. The limits are in [accounts.md](accounts.md#quotas).
  5. Store it in `head`, replacing the older version, with the next `seq` from the counter in `server_meta`, and raise `max_v` if needed.

  The response carries the current `epoch`.
- **`GET /pull?after=&limit=`**: `SELECT ... FROM head WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?`, plus `epoch`. A row replaced several times since the cursor arrives once, in its newest version.
- **`GET /snapshot`**: `head` rows (including tombstones) plus their `max(seq)`, both read in one transaction, plus `epoch`.

`seq` is global, so one user's cursor skips over other users' numbers. That is
harmless, because a cursor only needs to increase.

**Why a pull misses nothing.** A replaced row takes a `seq` above every number
handed out before, so any device whose cursor is below it receives it.
Deletes are rows with `deleted = 1`, which stay in `head`, so they arrive like
any other version. This requires that versions become visible in `seq` order,
which SQLite's single writer guarantees. If the server ever moves to Postgres
or multiple instances, this breaks. Pull would then need a per-user counter
allocated under a row lock in the push transaction, or must serve only up to a
commit-safe watermark.

### Why only the newest version

Pull needs only the order of arrival, which `seq` on `head` gives. Keeping
every version as well would allow restores to any point in time, but it more
than doubles the database, and backups multiply its size about tenfold
([accounts.md](accounts.md#account-cap)). History comes from the backups and
device snapshot files instead ([backups.md](backups.md)), which cover the
realistic case: a bad edit noticed within days.

### Server restore and epoch

A whole-database restore (Litestream, see [deployment.md](deployment.md#recovery-procedures))
rolls back `seq`. It also loses changes that clients pushed after the restore
point, which those clients already removed from their outboxes. The epoch
handles this.

1. A new random `epoch` is written before the restored database serves anything: automatically at startup when the restore left `app.db.restored` next to the database (Litestream's init step does), or with `server new-epoch` after a manual restore.
2. Each client sees the new epoch on its next pull (or snapshot) and runs an **epoch reset**:
   - mark every local row as outbox ("re-upload all");
   - set the cursor to 0;
   - store the new epoch;
   - sync.
3. The server acknowledges every version it still has, or has a newer one of, without storing it. Re-uploads within 24 h of an epoch change are exempt from the daily write quota; `newEpoch` records when the epoch started as `epoch_started_at` in `server_meta`.

A whole-database restore is for disasters only, such as VPS loss or
corruption. It is not for undoing bad data: the re-upload would bring the bad
rows back. Bad data is undone by importing an earlier snapshot with "Replace
everything", which writes the old rows as new changes
(see [backups.md](backups.md#restore-procedures)).

## Schema evolution

- Each change carries `v`, the app schema version that wrote it. The server stores `v` and `data` verbatim and never migrates them.
- A client upgrades incoming rows with an older `v` on apply, using the same upgrade functions as its local migrations.
- A client receiving a `v` newer than it understands pauses sync and shows "update the app".
- The server rejects pushes with a `v` older than the newest `v` it has seen from that user. A device still on an older build therefore can't wipe columns written by a newer one.
- Both cases end by themselves: the web app and the Android app switch to the server's build without an install ([migrations.md](migrations.md#mixed-versions-across-devices)).

Full rules, including data fixes and server migrations: [migrations.md](migrations.md).

## Semantic conflicts

| Case | Handling |
| --- | --- |
| The same entity is created on two offline devices | Deterministic ids and HLCs wherever there is a natural key (see above). Real user-created duplicates are rare; a merge tool comes later if needed. |
| Concurrent reordering or inserting at the same position | Fractional index keys; ties broken by `id`. |
| A row is edited after it was deleted elsewhere | The greater HLC wins. If that is the edit, the row comes back, along with its children (deletes don't cascade). |
| The same session is open on two devices | Each set is its own row, so all sets are kept. Idle end is derived at query time, not written (see [architecture.md](architecture.md#data-model-client)), so it can't overwrite anything. |
| Uniqueness rules (e.g. exercise names) | Not enforced in the database. The UI warns. |

## Failure modes

| Failure | Result |
| --- | --- |
| Network drops mid-push | Unacknowledged outbox entries are re-sent. The server reports duplicates as `ok`. |
| Crash mid-pull | The page transaction rolls back, and the cursor is unchanged. The page is re-pulled. |
| Device offline for weeks | The outbox grows and is pushed later. The pull pages through everything missed. Inserted rows count against quota. |
| Device clock far ahead | Those changes are rejected; the rest of the batch goes through. The user is warned, and "repair clock" fixes it. Clocks that are behind are handled by the receive rule. |
| App data wiped on a device | Fresh device: new device id, then bootstrap from the snapshot. Unpushed outbox entries are lost, so the UI shows "unsynced changes" prominently. |
| Server restored from Litestream | The epoch changes, and every device re-uploads and re-pulls. |
| Server data lost entirely | Restore from backups (see [deployment.md](deployment.md)); this is also an epoch change. |
| Quota exceeded | Rejected changes stay in the outbox, local use continues, and the UI shows the reason. |
| Token revoked or expired | The app asks to log in again. The outbox is kept. |
| Outdated app | Push gets `schema_outdated`, or the server's minimum client version returns 426. The app shows "update". The outbox is kept, and sync resumes once the app has switched to the new build; only a 426 on Android needs an APK. |

## Testing

The clock and the merge logic are covered by a model-based fuzz test
(`packages/core/src/sync/sync.fuzz.test.ts`, fast-check). Three devices with
skewed clocks run random edits, deletes, undos, and seeds of deterministic
rows, some with HLCs ahead of the device clock. Pushes are lost, duplicated,
or lose their response, possibly with edits in between. Pulls use random page
sizes. The server is restored from a checkpoint with a new epoch. Everything
runs against the real client code and the shared server module on in-memory
SQLite.

It asserts:

- after every operation, the device clock is at least every non-deterministic HLC stored on the device;
- a local edit always beats the version it was made on;
- after syncing until nothing changes, the server's head rows are the newest version of each row that ever existed on any device, so a write lost everywhere fails even though the devices agree;
- every device's synced tables equal the server's head rows, and all outboxes are empty.

CI runs 300 sequences of up to 150 operations. `SYNC_FUZZ_RUNS=5000 pnpm test
fuzz` runs a longer check. Each assertion was checked to catch a deliberately
broken merge, write guard, acknowledgement, epoch reset, head upsert, and
`receive` rule; the newest-version check also catches a merge that keeps the
older version on the server and every device alike.

## Alternatives considered

| Option | Fit | Reason not chosen |
| --- | --- | --- |
| **Evolu** | Closest match. SQLite on the client, per-column LWW with HLC, stateless relay, MIT licensed. | Encryption is mandatory, so server-side backups, restores, and the CLI must be full Evolu clients holding the user's key. Identity is a mnemonic, not a login, so it doesn't fit invites or quotas. The schema and query API are Evolu's, and the API has changed across major versions. |
| **TinyBase** MergeableStore | Built-in CRDT sync over WebSocket. | Keeps the whole dataset in an in-memory store. Queries use TinyBase's API instead of SQL, which hurts analytics. |
| **cr-sqlite** | Column-level CRDT as a SQLite extension, which would keep plain SQL. | Maintenance activity is unclear. |
| **LiveStore** (event sourcing on SQLite) | Intent-preserving events. | Replay cost and migration complexity for no benefit at this scale. |
| **PowerSync / ElectricSQL / Zero** | Mature sync engines. | All require a Postgres (or similar) backend plus a sync service. |
| **Linear-style engine** ([reverse-engineered write-up](https://github.com/wzhudev/reverse-linear-sync-engine)) | Server-authoritative total order (`lastSyncId`), operation-based transactions with per-field updates, WebSocket delta packets, an in-memory MobX object pool persisted to IndexedDB, partial and lazy bootstrap. | It is built for shared, permissioned workspaces with mostly-online clients. Arrival order deciding the winner is wrong for us: a phone that was offline for days would overwrite newer edits made elsewhere. A domain-aware server doubles the schema work, and an in-memory graph doesn't help SQL analytics. Borrowed ideas: push notification of new changes (planned), per-field updates (the upgrade path above), and transaction-based undo ([features.md](features.md#data)). |

Decision: the custom protocol. It is small (a clock, an outbox, two endpoints,
one server table) and every part of it can be tested in isolation. The server data
stays plain JSON rows that the CLI, restores, and backups can read directly.
End-to-end encryption is out of scope (see [accounts.md](accounts.md#privacy)).
