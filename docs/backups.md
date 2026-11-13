# Backups

Goal: never lose training data, and never discover a broken backup too late.
FitNotes' failure mode was backups that silently didn't happen, so every layer
reports its freshness, and the daily copy and the Litestream replica are
restored automatically every day.

## Threats

| Threat | Covered by |
| --- | --- |
| Phone lost or app data wiped | The server, plus other devices |
| VPS lost or server DB corrupted | Litestream replica in R2 (point-in-time); daily DB copies; every device holds its full state |
| R2 bucket or Cloudflare account lost | The VPS is unaffected; every device holds its full state |
| VPS compromised (an attacker deleting backups) | Separate buckets and tokens; every device holds its full state |
| A bad edit or buggy app version spreading via sync | On-device snapshot files and exports, imported with "Replace everything"; the server's DB copies for older states |

Sync is not a backup on its own, because it spreads mistakes as faithfully as
data. The layers below add history and copies outside the sync system.

## Layers

The server keeps only the newest version of each row, not their history
([sync.md](sync.md#why-only-the-newest-version)), so these layers are the only
copies of past states.

1. **Litestream replica.** Continuous replication of `app.db` to R2, with point-in-time restore. Retention is 3 days. This is the disaster recovery for the VPS. See [deployment.md](deployment.md#litestream).
2. **Daily DB copy.** The server runs a daily job: `VACUUM INTO` a temp file, check it with `PRAGMA integrity_check`, compress it with Brotli (quality 9, about 40% smaller than gzip), and upload it to R2.
   - Keys: `daily/<date>.db.br` and, on the 1st of each month, `monthly/<date>.db.br`.
   - `server unpack-copy` turns a copy back into a checked database file ([deployment.md](deployment.md#the-server-command)).
   - Retention by R2 lifecycle rules, kept in `deploy/r2/` ([deployment.md](deployment.md#r2-buckets)): 7 days daily, 3 months monthly, 14 days pre-migration.
   - The format doesn't depend on Litestream, so it survives a Litestream bug or format change.
   - The same copy is taken before a server migration (`pre-migration/<time>-<first migration>.db.br`); a failed copy stops the migration.
3. **On-device snapshots** (Android). After each session ends, by a manual stop or by idling out, the app writes a snapshot file to `Documents/WorkoutLogger/` in shared storage and keeps the newest 10.
   - This protects against a corrupted local store, and it works without any server. The folder is visible in a file manager and survives an uninstall.
   - If the app wasn't open when the session idled out, the file is written on the next start. A failed write shows an error and is retried on the next start.
   - Android lets the app see only files it created itself. After a reinstall, the earlier install's files stay in the folder but are no longer pruned.
   - On the web, use the manual export button. Browsers can't write files silently.

Any user can export their own data from the app at any time with Settings → Export snapshot. It exports the device's database, which on a synced device holds the account's full state.

## Storage isolation

Each writer has its own bucket and its own R2 token:

| Bucket | Writer | Readers |
| --- | --- | --- |
| `wl-litestream` | Litestream sidecar (its own token) | Restore procedure, the app's restore rehearsal (a read-only token) |
| `wl-backups` | App daily job (its own token) | Restore procedure, restore rehearsal |

A leaked app token then can't delete the Litestream replica, and vice versa.
The app's token for `wl-litestream` can only read it.
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

`GET /api/status` (owner detail; others see only `version`, `commit`, and `backupsOk`) reports:

- the time of the last Litestream upload, from its control socket
- the time of the last good daily DB copy, and the last error
- free disk space and the database size
- the time of the last good restore rehearsal of each, and their last errors

Settings shows the user's own last sync time and unsynced changes, and on
Android, the time of the last snapshot file. The owner's
[admin page](accounts.md#admin-page) shows the server backup layers, free
disk, the database size, and the size of the DB copies in `wl-backups` by
prefix (`daily`, `monthly`, `pre-migration`), which shows whether the
lifecycle rules keep up. The server lists the bucket with its own token
only when the page is opened, not on `/api/status`: a listing is a billed
R2 operation. The Litestream replica isn't counted.

The Settings tab shows a warning dot when (the owner's two also show on the
Admin row in Settings):

- signed in, with unsynced local changes, and no sync in the last 3 days (or ever)
- for the owner: the last run of a restore rehearsal failed
- for the owner: any server backup layer is stale (Litestream > 1 h, daily copy > 2 days, each restore rehearsal > 2 days)
- for the owner: the server database is over 700 MB, at most about 4 GB of R2 once retention fills ([accounts.md](accounts.md#account-cap)); also on the admin page

The on-device snapshots have no dot: they are written only when a session
ends, so their age says nothing on its own, and a failed write already shows
an error.

An external dead-man check is **required**: an uptime monitor polls
`/api/status` and alerts when it reports stale backups or doesn't respond.

## Restore rehearsal

Two server jobs restore a backup into a temp file every day and check it
against the live database. A failed run makes `backupsOk` false at once,
without waiting for the layer to go stale, so the uptime monitor alerts; the
next good run clears it. Each costs a few R2 reads a day.

Both check that `head` and `user` aren't empty in the restored file when
they aren't in the live database. Rows leave those tables only when an
account is deleted, so an empty one means the file isn't of this database.
Exact counts can't be compared: the live database changes after the backup.

- **Daily copy** (`copy-rehearsal`, 04:00 UTC, an hour after the copy):
  1. List `wl-backups` and take the newest `daily/` copy. It fails if there is none or the newest is over 2 days old: copies are uploaded but don't arrive, or the lifecycle rules deleted them.
  2. Download it and restore it the way `server unpack-copy` does, including `PRAGMA integrity_check`.
- **Litestream replica** (`replica-rehearsal`, 04:30 UTC):
  1. Read the live `epoch` and `seq` from `server_meta`. `seq` only grows, also when an account is deleted.
  2. Wait 30 s, three times Litestream's `sync-interval`, so everything committed before is in the replica.
  3. `litestream restore` the replica's newest state, the way the "Server DB corrupted" procedure does ([deployment.md](deployment.md#recovery-procedures)), and run `PRAGMA integrity_check`.
  4. The restored epoch must be the live one, and its `seq` at least the one read in step 1. A lower `seq` means the replica misses pushes the server acknowledged over 30 s ago.

  It runs in the app container, with the `litestream` binary the image copies from the Litestream image and a read-only token for `wl-litestream` (`LITESTREAM_R2_READ_*`), which the compose file requires. Without the token, e.g. in local runs, it is off.
- **CI:** `snapshot.test.ts` in `core` exports a database with rows and tombstones as a snapshot file, imports it into an empty one, and compares.
- **Manual, before opening sign-up** (done in phase 6): walk through the "VPS lost" procedure into a scratch volume.

## Restore procedures

| Situation | Procedure |
| --- | --- |
| New or wiped device | Log in. The app bootstraps from the server snapshot. |
| Restore a snapshot file into the app | Settings → Import snapshot. Rows are applied with the normal LWW merge, so importing never destroys newer data. "Replace everything" first saves the device's current data as a snapshot file (and replaces nothing if that fails), then writes the snapshot rows with fresh HLCs plus tombstones for rows not in the snapshot, so it wins and syncs out. Its Undo lasts as long as the toast; after that, importing the saved file with Replace goes back. |
| Undo a bad change everywhere | Import an earlier snapshot file (an Android session snapshot or an export) with "Replace everything" on one device; it syncs out. For an older state, the owner can open a daily or monthly DB copy, export that user's `head` rows as a snapshot, and send it to them. There is no tool for that yet. |
| VPS lost, server DB corrupted | [deployment.md](deployment.md#recovery-procedures): restore from Litestream (or the newest daily copy) and start a new epoch; a lost VPS's automatic restore starts it itself. Devices re-upload what the server is missing. |
| Account deleted | No restore; see [accounts.md](accounts.md#privacy) for how long copies persist. |
