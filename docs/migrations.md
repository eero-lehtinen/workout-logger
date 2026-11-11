# Migrations

Data exists in several places, at different schema versions, at the same time:

| Where | Schema | Upgraded by |
| --- | --- | --- |
| Local DB on each device | `SCHEMA_VERSION` of the web build the device runs | Client migrations, on app start |
| Rows arriving via sync | `v` of the app that wrote them | Row upgrade on apply |
| Server change log and head table | Each row's original `v`, kept forever | Never upgraded on the server. Readers upgrade. |
| Snapshots and backups | `schema_version` in their `meta` table | Row upgrade on import |
| CLI mirror (phase 10) | `SCHEMA_VERSION` of the CLI build | The same client migrations |
| Server's own tables (auth, `change`, `head`, `job_run`, ...) | Server schema | Server migrations, on startup |

The domain schema has one version number, `SCHEMA_VERSION` in `packages/core`.
It is the same number as the `v` on synced rows. Server tables have their own
migration sequence, because the server never interprets domain data.

## Domain schema changes

Every version step `n → n+1` lives in `packages/core/src/migrations/v<n+1>.ts`,
is appended to `MIGRATIONS`, and raises `SCHEMA_VERSION`. A step (`Migration`
in `core`) has:

1. **DDL** for local tables (`up`): `CREATE`/`ALTER`/rebuild via an untyped Kysely, since the current types describe the latest schema, not this step's.
2. **A row upgrade per affected synced table** (`upgrade`, keyed by the table name at version `n`):
   `({ id, data }) → [{ table, id, data }]`.
   - It is pure, deterministic, and total. It never throws; values it can't map go to a notes field or a default.
   - It usually returns one row with the same table and id.
   - It can return a different table, for a rename, or several rows, for a split. Rows it creates get deterministic ids (UUIDv5 of the source id plus a suffix).
3. **DDL after the row upgrade** (`cleanup`), e.g. dropping a renamed table, and optional local-only work: rebuilding indexes or caches in non-synced tables.

The schema version of a local database is `PRAGMA user_version`.

The same upgrade functions are used everywhere:

- **Client migration** (on startup, in the worker, in one transaction, after copying the DB file):
  1. Run the DDL.
  2. Read every row of the affected tables, before writing any. Rows an upgrade produces in another table are not upgraded again in the same step.
  3. Pass each row through `upgrade`.
  4. Write the result back with the source row's HLC and deleted flag, and remove the source row if the result doesn't keep its table and id.
  5. Run the cleanup DDL and set `user_version`.

  A row waiting in the outbox stays queued under its new table and id. The undo stack is cleared, because it holds row versions in the old format.

  There's no separate SQL data migration that could disagree with the function. The data is small, so a full pass is cheap.

  `migrate` takes a `beforeMigrate(from, to)` hook, called for an existing database before the transaction starts. The caller copies the database file there. A database from a newer app (`user_version` above the app's version) is never touched; opening it fails with "update the app".
- **Sync pull:** incoming rows with `v < SCHEMA_VERSION` are passed through each step up to the current version before the LWW comparison.
- **Snapshot import** uses the same path, and so will the CLI mirror and `wl restore` (phase 10).

### Rules

- **Migrations never change HLCs, and never write outbox entries.** A migration is a change of representation, not an edit. Every device computes the same result from the same input, so nothing needs to sync. If migrations stamped new HLCs, every device would push every row after an update, burning quota and racing each other.
  - Rows produced by a split or rename keep the source row's HLC.
- **Never edit a released migration.** Add a new step.
- **Prefer additive changes:** a new nullable column or a new table. To remove a column, stop using it first; drop it in a later step.
- **Enum values are a schema change.** Adding a value bumps the version, because older clients can't interpret it.
- **Each step has fixture tests:**
  - rows as written by version `n` upgrade to the expected rows at `n+1`;
  - the full chain from every past version reaches the current version (`upgradeRow(row, fromVersion)`);
  - a DB created at the old version and migrated equals the old rows passed through `upgrade` and inserted into a fresh current-version DB. `migrateFixture` in `@workout-logger/core/testing` builds both and returns their dumps.

  The runner's own tests use a synthetic step with a new column, a rename, and a split (`packages/core/src/migrations/migrations.test.ts`).

## Pending local changes during an upgrade

Push sends each row's *current* state, not a stored payload ([sync.md](sync.md#push)). After the app updates:

1. The client migration upgrades the local tables, including rows that are still in the outbox.
2. The next push sends those rows at the new `v`.

So unsynced edits made on the old version survive the upgrade without special handling.

## Mixed versions across devices

The web app and the Android app both switch to a new web build by
themselves, out of sight, once no session is running
([architecture.md](architecture.md#updates-and-version-compatibility)). Until all
of a user's devices run the same schema:

| Device | Push | Pull |
| --- | --- | --- |
| Newer app | Normal | Older rows are upgraded on apply |
| Older app | Rejected as `schema_outdated` once the server has seen a newer `v` from this user. Otherwise an older app would reset columns it doesn't know. | Pauses at the first row with a newer `v` |

The older app keeps working locally, and its outbox is kept. After it has
switched to the new build, the migration upgrades its pending rows and sync
resumes.

The cost: every domain schema change stops each user's other devices from
syncing until they have updated. On Android that needs the app opened once
and put away once, with no install. An APK is needed only when the same
change also needs a newer shell ([deployment.md](deployment.md#live-updates));
then the app prompts for it, and sync waits for the install.

Going back is not possible. A device follows the server to whatever build
it serves, also to an older one after a rolled-back deploy, but a build
older than the database refuses to open it and asks for an update, without
touching the data. A bad build that carried a migration is therefore fixed
forward ([deployment.md](deployment.md#recovery-procedures)).

## Data fixes

Not built yet, and no phase has needed one so far: this is the design for
when one does.

Some changes depend on more than one row: deduplicating exercises, re-deriving
muscle targets from an updated catalog, repairing data written by a buggy
version. They can't be expressed as per-row upgrades, and they *are* edits, so
they must sync.

A data fix is a named, versioned function in `packages/core/src/fixes/` that reads
a user's data and returns rows to write. Only one place runs it, so devices
can't race:

- **Users with an account:** a server job (`server run-fix <name>`) runs it over each user's head state using `core`. It appends the results as changes with node `fix` and HLC `max(now, max hlc in the user's log)⁺`, the same rule as `wl restore`. Clients receive them through normal pulls. This is the one place server code interprets domain data, and only through `core`.
- **Local-only users** (no account, one device): the app runs pending fixes on startup and records them in a local `_applied_fix` table.

Every fix is idempotent: running it on already-fixed data writes nothing.

## Seed catalog updates

Built-in exercises and muscles change through the seed catalog
(`packages/exercises`), not through migrations. A catalog change raises
`CATALOG_REVISION` by one and is written with deterministic ids and HLCs, and
user edits to built-ins win ([sync.md](sync.md#deterministic-writes)).
`CATALOG_WALL` never changes. Seeding runs on every start; rows already at the
current revision are skipped.

- Removing a built-in exercise archives it; it is never deleted, because history refers to it.
- Removing a muscle target from a built-in needs an explicit tombstone row in the seed. Dropping the entry alone leaves the old target in place on devices that already seeded it.

## Server migrations

Server tables (`change`, `head`, `server_meta`, `user_sync`, `job_run`, and
in phase 11 `usage`, `quota`, `stored`) use Kysely's migrator, with the steps in
`apps/server/src/db/migrations.ts` (`0001_sync`, `0002_job_run`, ...). Better
Auth's tables are migrated by its `getMigrations` API right after, from the
same configuration the server runs with.

- **When:** on startup, before the server accepts requests ([deployment.md](deployment.md#build-and-release)), and when the `server` command opens the database.
- **Order:** take the pre-migration DB copy to R2 (only for a database that has tables), then Kysely's steps, then Better Auth's.
- **Not transactional.** Kysely runs SQLite migrations without a transaction (its SQLite adapter reports no transactional DDL), so a step that fails halfway leaves its earlier statements applied. Recover with the pre-migration copy.
- **Forward only.** To roll back: restore the pre-migration copy, run `server new-epoch`, and redeploy the previous SHA ([deployment.md](deployment.md#recovery-procedures)).
- No expand/contract dance: there is one instance and a few seconds of downtime, and clients are offline-tolerant.
- Server migrations never touch `data` in `change` or `head`. Domain data changes go through data fixes.

## Protocol changes

- The sync endpoints are versioned (`/api/sync/v1/...`).
- A breaking protocol change adds `v2` next to `v1`. After all clients pass `MIN_CLIENT_VERSION`, `v1` is removed.
- Non-breaking additions (new optional response fields) don't need a new version.
