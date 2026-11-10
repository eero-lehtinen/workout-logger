# Backups

Goal: never lose training data, and never discover a broken backup too late.
FitNotes' failure mode was backups that silently didn't happen, so every layer
reports its freshness, and restores are rehearsed automatically.

## Threats

| Threat | Covered by |
| --- | --- |
| Phone lost or app data wiped | The server, plus other devices |
| VPS lost or server DB corrupted | Litestream replica in R2 (point-in-time); daily DB copies; every device holds its full state |
| R2 bucket or Cloudflare account lost | The VPS is unaffected; the owner's encrypted PC copy |
| VPS compromised (an attacker deleting backups) | Separate buckets and tokens; the owner's PC copy |
| A bad edit or buggy app version spreading via sync | Server change log (per-row / per-account point-in-time restore) |

Sync is not a backup on its own, because it spreads mistakes as faithfully as
data. The layers below add history and copies outside the sync system.

## Layers

1. **Server change log** (always on). Append-only history of every change, see [sync.md](sync.md#why-an-append-only-log). Any row, table, or account can be restored to any past time with `wl restore`.
2. **Litestream replica.** Continuous replication of `app.db` to R2, with point-in-time restore. Retention is set explicitly to 14 days (the default is shorter). This is the disaster recovery for the VPS. See [deployment.md](deployment.md#litestream).
3. **Daily DB copy.** The server runs a daily job: `VACUUM INTO` a temp file, check it with `PRAGMA integrity_check`, gzip it, and upload it to R2.
   - Keys: `daily/<date>.db.gz` and, on the 1st of each month, `monthly/<date>.db.gz`.
   - Retention by R2 lifecycle rules: 30 days daily, 12 months monthly.
   - The format doesn't depend on Litestream, so it survives a Litestream bug or format change.
   - The same job runs before every server migration (`pre-migration/<version>.db.gz`).
4. **Owner's PC copy.** A scheduled task runs `wl backup --all <staging dir>` and then `restic backup <staging dir>`.
   - `wl backup --all` uses the owner key to download each user's live `/snapshot` as SQLite, plus the latest daily DB copy.
   - restic encrypts and dedups. Its repository can live in a cloud-drive folder, because the files contain other users' health data.
   - This copy is independent of both the VPS and Cloudflare.
5. **On-device snapshots** (Android). After each session ends, write a snapshot file to a user-visible folder (e.g. `Documents/WorkoutLogger/`). Keep the last 10.
   - This protects against a corrupted local store, and it works without any server.
   - On the web, use the manual export button. Browsers can't write files silently.

Any user can export their own data from the app at any time. Settings → Export downloads `/snapshot`, or the local DB when offline.

## Storage isolation

Each writer has its own bucket and its own R2 token:

| Bucket | Writer | Readers |
| --- | --- | --- |
| `wl-litestream` | Litestream sidecar (its own token) | Restore procedure |
| `wl-backups` | App daily job (its own token) | Owner's PC (read-only token) |

A leaked app token then can't delete the Litestream replica, and vice versa.
R2 bucket locks (retention locks) may prevent deletion even with a write
token. Their availability still needs checking.

## User-controlled destinations

Future work (P2). These are for users who want backups outside the server, or no account at all:

- Automatic snapshot export to a user-chosen location, e.g. a folder that the user's own cloud drive syncs. The Android Storage Access Framework allows picking any folder once and writing to it later.
- Manual export to a file and import from a file. This already exists as P0 and works without an account.

## Snapshot format

A **user snapshot** is a SQLite file holding one user's synced tables (head
state, including tombstones). It uses the same schema as the app, with the
local tables (`_outbox`, `_sync_state`, `_undo`) present but empty, plus a
`meta (key, value)` table: `schema_version`, `created_at`, `source` (`device`
or `server`), and `server_epoch` when known.

Import reads the rows of whatever version the file has and passes them through
the row upgrade chain. A snapshot from a newer app is refused. Merge applies
the rows with the LWW rule and queues the winners for push, since the server
may not have them. Replace runs as one undoable write, so the snackbar can
revert it.

It can be read without the app (`sqlite3`, the CLI) and imported by the app.

## Visibility

`GET /api/status` (owner detail; users see a summary) reports:

- the time of the last Litestream sync
- the age of the last daily DB copy
- the result of the last restore rehearsal
- free disk space

Settings shows the user's own last sync time and the age of the last local snapshot.

The home screen shows a warning badge when:

- the last sync is older than 3 days and there are unsynced local changes
- the last on-device snapshot is older than 7 days
- for the owner: any server backup layer is stale (Litestream > 1 h, daily copy > 2 days), or the last rehearsal failed

An external dead-man check is **required**: an uptime monitor polls
`/api/status` and alerts when it reports stale backups or doesn't respond.

## Restore rehearsal

- **Monthly** (server scheduled job):
  1. Restore the Litestream replica into a temp file.
  2. Run `PRAGMA integrity_check`.
  3. Compare per-table row counts with the live DB.

  It does the same with the newest daily copy. The result goes to `/api/status`.
- **CI:** build a database, export a user snapshot, import it into an empty client DB, and compare.
- **Manual, before inviting anyone:** walk through the "VPS lost" procedure into a scratch volume.

## Restore procedures

| Situation | Procedure |
| --- | --- |
| New or wiped device | Log in. The app bootstraps from the server snapshot. |
| Restore a snapshot file into the app | Settings → Import snapshot. Rows are applied with the normal LWW merge, so importing never destroys newer data. "Replace everything" instead writes the snapshot rows with fresh HLCs plus tombstones for rows not in the snapshot, so it wins and syncs out. |
| Undo a bad change everywhere | `wl restore --at <time> [--table T] [--id X]`, or a whole-account restore. It appends new changes (see [sync.md](sync.md#restores-through-the-log)). Requires a write-scoped key. The owner can pass `--user`. |
| VPS lost, server DB corrupted | [deployment.md](deployment.md#recovery-procedures): restore from Litestream (or the newest daily copy), then `server new-epoch`. Devices re-upload what the server is missing. |
| Account deleted | No restore; see [accounts.md](accounts.md#privacy) for how long copies persist. |
