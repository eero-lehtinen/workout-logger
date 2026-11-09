# Deployment

The server runs on the owner's VPS under Dokploy. Backups go to Cloudflare R2,
a different provider, so losing either the VPS or the bucket loses no data.

## Why a VPS instead of Cloudflare Workers + D1

- Dokploy already runs there and handles domains, TLS (Traefik + Let's Encrypt), env vars, logs, and redeploys.
- The server database is a plain SQLite file. It works with the same tools as the client database and the CLI mirror, and has none of D1's daily row limits or 500 MB cap.
- One runtime (Node) for the server, jobs, and tests.
- Costs: the VPS is a single point of failure, and the OS is yours to maintain. Both are acceptable:
  - Clients are local-first, so downtime only delays sync.
  - Backups live off the VPS.

## Topology

```
VPS (Dokploy, Traefik, TLS)
└── compose project "workout-logger"
    ├── litestream-init  one-shot: restore app.db from R2 if missing
    ├── litestream       sidecar: streams app.db changes to R2 (wl-litestream)
    ├── app              Node + Hono: /api (auth, sync, admin, status),
    │                    static web build + PWA, scheduled jobs
    └── volume "data":   app.db (SQLite, WAL)

Cloudflare R2
├── wl-litestream/   continuous replica (Litestream token)
└── wl-backups/      daily/, monthly/, pre-migration/ DB copies (app token)
```

- **One container serves both the API and the web app**, so they share an origin. The web uses httpOnly cookie sessions. Android uses bearer tokens (see [accounts.md](accounts.md#login)).
- **Single instance by design.** SQLite has one writer, and the sync protocol relies on it ([sync.md](sync.md#server-side)).
- **Containers** run as the same non-root UID. Both the app and Litestream must be able to write `app.db`, `-wal`, `-shm`, and Litestream's metadata.
- **Server SQLite driver:** better-sqlite3 (*candidate*), used through Kysely, which Better Auth also supports.
- **Startup order:** `litestream-init` → `litestream` → `app`.

## Litestream

Settings to pin and verify against the Litestream 0.5 docs at implementation time:

- **App pragmas:** `journal_mode=WAL`, `busy_timeout=5000`, `synchronous=NORMAL`. Follow Litestream's checkpoint guidance (it may recommend disabling auto-checkpoint in the app).
- **Sync interval:** about 10 s, to keep R2 write operations low. The R2 free tier allows 1M Class A operations/month.
- **Snapshot retention:** 14 days, set explicitly. The default (about 24 h) limits how far back a point-in-time restore can go.
- **Metrics endpoint:** enabled, so that `/api/status` can report the last sync time.
- **Init step:** `litestream restore -if-db-not-exists -if-replica-exists`. On a fresh VPS this restores automatically; on an existing one it does nothing.
- **Never run two Litestream instances against the same replica path.** Rehearsal restores only read from it.

## Build and release

1. On push to `main`, GitHub Actions runs:
   - lint, type checks, and tests;
   - builds the web app and the server image;
   - pushes the image to GHCR, tagged with the commit SHA.
2. CI then calls the Dokploy deploy webhook with that SHA tag. Deployments always use pinned SHA tags, never `latest`, so a rollback is unambiguous.
3. Server startup, before accepting requests:
   1. Take the pre-migration DB copy to R2 (see [backups.md](backups.md#layers)).
   2. Run migrations: Better Auth tables, `change`, `head`, usage, invites. The single instance has an exclusive DB lock while migrating.

   The health check has a long enough start period that a slow migration doesn't cause a restart loop.
4. Android APKs are built in the same workflow on tags and attached to the GitHub release. The app checks GitHub releases for a newer APK.

Images are built in CI, not on the VPS, so that builds don't compete with the running server for CPU and RAM.

## Configuration

Set as Dokploy environment variables, never committed:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_URL` | Base URL, used for auth and links |
| `AUTH_SECRET` | Better Auth secret. Rotating it probably invalidates all sessions (to verify). |
| `DATABASE_PATH` | `/data/app.db` |
| `BACKUP_R2_*` | Endpoint, bucket, and token for `wl-backups` (app only) |
| `LITESTREAM_R2_*` | Endpoint, bucket, and token for `wl-litestream` (Litestream only) |
| `MIN_CLIENT_VERSION` | Older apps get HTTP 426 "update the app" |

The Dokploy deploy webhook URL and GHCR credentials live in GitHub and Dokploy secrets.

The owner account is created once with `server create-owner --email <email>`,
run via Dokploy's container terminal. The command refuses to run if an owner
already exists. No env var grants the owner role, so nobody can claim it by
signing up first.

## Scheduled jobs

These run in-process with a scheduler library (candidate: `croner`). On
startup, each job checks its last-run time and catches up on a run missed
during downtime.

| Job | Schedule |
| --- | --- |
| Daily DB copy | daily |
| Restore rehearsal | monthly |
| Prune old `usage` rows | daily |

Retention of R2 objects is done with R2 lifecycle rules, not app code.

## Monitoring

- Dokploy container logs, with Docker log rotation configured.
- `GET /api/status`: app version, server epoch, DB size, free disk, backup freshness, and the last rehearsal result (see [backups.md](backups.md#visibility)).
- An external uptime monitor on `/api/status` (required). It alerts when the endpoint is down or reports stale backups.
- If Litestream can't upload, the WAL keeps growing. Free disk and Litestream lag on `/api/status` catch this early.

## Recovery procedures

| Situation | Procedure |
| --- | --- |
| Bad deploy without a migration | Redeploy the previous SHA tag in Dokploy. |
| Bad deploy with a migration | Stop `app`. Restore the `pre-migration/<version>` copy into the volume, or restore Litestream to before the deploy. Run `server new-epoch`. Redeploy the previous SHA. |
| Bad data (wrong edits, buggy client) | Don't restore the DB. Use `wl restore` ([backups.md](backups.md#restore-procedures)). |
| Server DB corrupted | Stop `app`. Run `litestream restore -timestamp <before corruption>` into the volume. If the replica is unusable, use the newest daily copy. Run `server new-epoch`, then start `app`. Devices re-upload whatever the server lost ([sync.md](sync.md#server-restore-and-epoch)). |
| VPS lost | Provision a new VPS, install Dokploy, and create the compose project with the same env vars. `litestream-init` restores `app.db` on first start. Run `server new-epoch`. Point DNS at the new VPS. |
| R2 lost | Data on the VPS is unaffected. Create new buckets and tokens and update the env vars. Litestream starts a fresh replica, and the daily job resumes. The owner's PC copy covers the gap. |
