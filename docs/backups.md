# Backups

Goal: never lose training data and never discover a broken backup too late.
FitNotes' failure mode was backups that silently didn't happen, so every layer
reports its freshness.

## Threats

| Threat | Covered by |
| --- | --- |
| Phone lost or app data wiped | The server, plus other devices |
| Server or provider data loss | Every device holds the full state; offsite snapshots |
| A bad edit or buggy app version spreading to all devices via sync | Server change log (point-in-time restore); dated snapshots |
| Account lockout at the provider | Offsite snapshots on your own machine |

Sync is not a backup on its own, because it spreads mistakes as faithfully as
data. The layers below add history and copies outside the sync system.

## Layers

1. **Server change log** (always on with sync). Append-only history of every change, see [sync.md](sync.md#why-an-append-only-log). It can reconstruct the state at any past `seq` or time.
2. **Daily server snapshot.** A scheduled job (Cloudflare Cron Trigger) writes each user's current state as gzipped NDJSON to R2, at `snapshots/<user_id>/<date>.ndjson.gz`.
   - Retention: 30 daily, 12 monthly.
   - D1's built-in point-in-time recovery is an extra, whole-database layer. Its retention on the free plan still needs checking.
3. **Offsite pull to your PC.** `wl backup` pulls into the CLI's local mirror and writes a dated SQLite snapshot file into a configurable directory, e.g. a folder synced by your usual cloud drive. Run it as a scheduled task.
   - For a `user` account, it covers that user's own data.
   - With an owner API key, `wl backup --all` also downloads the latest daily snapshot of every user. This copy survives losing the Cloudflare account.
4. **On-device snapshots** (Android). After each session ends, write a snapshot file to a user-visible folder (e.g. `Documents/WorkoutLogger/`). Keep the last 10.
   - This protects against a corrupted local store, and it works without any server.
   - On the web, use the manual export button. Browsers can't write files silently.

## User-controlled destinations

Future work (P2). These are for users who want backups outside the server, or no account at all:

- Automatic snapshot export to a user-chosen location, e.g. a folder that the user's own cloud drive syncs. The Android Storage Access Framework allows picking any folder once and writing to it later.
- Manual export to a file and import from a file. This already exists as P0 and works without an account.

## Snapshot format

- **SQLite file** with the synced tables, using the same schema as the app plus a `meta` table (schema version, created at, source device).
- **NDJSON** for the server job: one change per line, the same shape as the sync protocol, gzipped.

Both formats can be read without the app: `sqlite3`, `jq`, the CLI.

## Visibility

Settings shows, for each layer:

- last success time
- size
- the latest error, if any

The home screen shows a warning badge when any of these is true:

- last sync is older than 3 days with unsynced local changes
- the last on-device snapshot is older than 7 days
- the server reports its last daily snapshot is older than 2 days (returned by `/status`)

## Restore procedures

| Situation | Procedure |
| --- | --- |
| New or wiped device | Install the app, enter the server URL and token. The app pulls the snapshot. |
| Restore from a snapshot file into the app | Settings → Import snapshot. Rows are applied with the normal LWW merge, so importing never destroys newer data. A separate "replace everything" option writes the snapshot rows with fresh HLCs, so they win and sync out to other devices. |
| Undo a bad change everywhere | `wl restore --at <time or seq> --table ... --id ...` (or a whole-account restore). Scoped to the API key's user; the owner can pass `--user`. It reads old row versions from the change log and re-writes them as new changes with fresh HLCs, which then sync to all devices. History is never rewritten, only appended. |
| Server lost | Deploy a new server. On any up-to-date device, run "re-upload all". Or seed the server from the latest offsite snapshot with `wl restore-server <file>`. |

A restore test runs in CI: build a database, snapshot it, restore into an empty one, and compare. A restore path that is never exercised can't be trusted.
