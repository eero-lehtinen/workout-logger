# Migrations

Data exists in several places, at different schema versions, at the same time:

| Where | Schema | Upgraded by |
| --- | --- | --- |
| Local DB on each device | `SCHEMA_VERSION` of the installed app | Client migrations, on app start |
| Rows arriving via sync | `v` of the app that wrote them | Row upgrade on apply |
| Server change log and head table | Each row's original `v`, kept forever | Never upgraded on the server. Readers upgrade. |
| Snapshots and backups | `v` stored in their `meta` table | Row upgrade on import |
| CLI mirror | `SCHEMA_VERSION` of the CLI build | The same client migrations |
| Server's own tables (auth, `change`, `head`, usage, ...) | Server schema | Server migrations, on startup |

The domain schema has one version number, `SCHEMA_VERSION` in `packages/core`.
It is the same number as the `v` on synced rows. Server tables have their own
migration sequence, because the server never interprets domain data.

## Domain schema changes

Every version step `n → n+1` lives in `packages/core/migrations/<n+1>.ts` and has:

1. **DDL** for local tables: `CREATE`/`ALTER`/rebuild via Kysely.
2. **A row upgrade per affected synced table:**
   `upgrade(table, data) → [{ table, id, data }]`.
   - It is pure, deterministic, and total. It never throws; values it can't map go to a notes field or a default.
   - It usually returns one row with the same table and id.
   - It can return a different table, for a rename, or several rows, for a split. Rows it creates get deterministic ids (UUIDv5 of the source id plus a suffix).
3. **Optional local-only work:** rebuilding indexes or caches in non-synced tables.

The same upgrade functions are used everywhere:

- **Client migration** (on startup, in the worker, in one transaction, after copying the DB file):
  1. Run the DDL.
  2. Read every row of the affected tables.
  3. Pass each row through `upgrade`.
  4. Write the result back.

  There's no separate SQL data migration that could disagree with the function. The data is small, so a full pass is cheap.
- **Sync pull:** incoming rows with `v < SCHEMA_VERSION` are passed through each step up to the current version before the LWW comparison.
- **Snapshot import, the CLI mirror, and `wl restore`** use the same path.

### Rules

- **Migrations never change HLCs, and never write outbox entries.** A migration is a change of representation, not an edit. Every device computes the same result from the same input, so nothing needs to sync. If migrations stamped new HLCs, every device would push every row after an update, burning quota and racing each other.
  - Rows produced by a split or rename keep the source row's HLC.
- **Never edit a released migration.** Add a new step.
- **Prefer additive changes:** a new nullable column or a new table. To remove a column, stop using it first; drop it in a later step.
- **Enum values are a schema change.** Adding a value bumps the version, because older clients can't interpret it.
- **Each step has fixture tests:**
  - rows as written by version `n` upgrade to the expected rows at `n+1`;
  - the full chain from every past version reaches the current version;
  - a DB created at the old version and migrated equals the old rows passed through `upgrade` and inserted into a fresh current-version DB.

## Pending local changes during an upgrade

Push sends each row's *current* state, not a stored payload ([sync.md](sync.md#push)). After the app updates:

1. The client migration upgrades the local tables, including rows that are still in the outbox.
2. The next push sends those rows at the new `v`.

So unsynced edits made on the old version survive the upgrade without special handling.

## Mixed versions across devices

The web app updates as soon as the user reloads; a sideloaded APK updates
later. Until all of a user's devices run the same schema:

| Device | Push | Pull |
| --- | --- | --- |
| Newer app | Normal | Older rows are upgraded on apply |
| Older app | Rejected as `schema_outdated` once the server has seen a newer `v` from this user. Otherwise an older app would reset columns it doesn't know. | Pauses at the first row with a newer `v` |

The older app keeps working locally, and its outbox is kept. The app prompts to
update. After updating, the migration upgrades its pending rows and sync
resumes.

The cost: every domain schema change forces each user's other devices to update
before they sync again. To keep this rare:

- batch schema changes into releases;
- the APK checks GitHub releases on start and prompts to update.

## Data fixes

Some changes depend on more than one row: deduplicating exercises, re-deriving
muscle targets from an updated catalog, repairing data written by a buggy
version. They can't be expressed as per-row upgrades, and they *are* edits, so
they must sync.

A data fix is a named, versioned function in `packages/core/fixes/` that reads
a user's data and returns rows to write. Only one place runs it, so devices
can't race:

- **Users with an account:** a server job (`server run-fix <name>`) runs it over each user's head state using `core`. It appends the results as changes with node `fix` and HLC `max(now, max hlc in the user's log)⁺`, the same rule as `wl restore`. Clients receive them through normal pulls. This is the one place server code interprets domain data, and only through `core`.
- **Local-only users** (no account, one device): the app runs pending fixes on startup and records them in a local `_applied_fix` table.

Every fix is idempotent: running it on already-fixed data writes nothing.

## Seed catalog updates

Built-in exercises and muscles change through the seed catalog, not through
migrations. A new catalog version is written with deterministic ids and HLCs,
and user edits to built-ins win ([sync.md](sync.md#deterministic-writes)).
Removing a built-in archives it; it is never deleted, because history refers
to it.

## Server migrations

Server tables (Better Auth, `change`, `head`, `server_meta`, `user_sync`,
invites, usage, quotas) use the Kysely migrator. Better Auth's own migrations
run through its CLI or API at the same point.

- **When:** on startup, before the server accepts requests ([deployment.md](deployment.md#build-and-release)).
- **Order:** take the pre-migration DB copy to R2, then migrate in one transaction.
- **Forward only.** To roll back: restore the pre-migration copy, run `server new-epoch`, and redeploy the previous SHA ([deployment.md](deployment.md#recovery-procedures)).
- No expand/contract dance: there is one instance and a few seconds of downtime, and clients are offline-tolerant.
- Server migrations never touch `data` in `change` or `head`. Domain data changes go through data fixes.

## Protocol changes

- The sync endpoints are versioned (`/api/sync/v1/...`).
- A breaking protocol change adds `v2` next to `v1`. After all clients pass `MIN_CLIENT_VERSION`, `v1` is removed.
- Non-breaking additions (new optional response fields) don't need a new version.
