# Deployment

The server runs on the owner's VPS under Dokploy, at
<https://lift.eerolehtinen.fi>. Backups go to Cloudflare R2, a different
provider, so losing either the VPS or the bucket loses no data.

**Current state (since phase 5):** the `app` container serves the static web build,
`GET /api/status`, and the Android app's update endpoints
([Android releases](#android-releases)). There is no database, auth, sync, Litestream, or
scheduled job yet; phase 6 adds them to the same image, compose service, and
CI pipeline. Sections below describe the full design and say where something
is not built yet.

The origin `https://lift.eerolehtinen.fi` is where browsers keep the local
database (OPFS is per origin). Moving the app to another hostname strands the
data logged at the old one, unless it is exported as a snapshot first.

## Why a VPS instead of Cloudflare Workers + D1

- Dokploy already runs there and handles domains, routing (Traefik), env vars, logs, and redeploys.
- The server database is a plain SQLite file. It works with the same tools as the client database and the CLI mirror, and has none of D1's daily row limits or 500 MB cap.
- One runtime (Node) for the server, jobs, and tests.
- Costs: the VPS is a single point of failure, and the OS is yours to maintain. Both are acceptable:
  - Clients are local-first, so downtime only delays sync.
  - Backups live off the VPS.

## Topology

```
Cloudflare: DNS (*.eerolehtinen.fi, proxied), TLS, Tunnel
└── cloudflared (Dokploy app on the VPS) ──HTTP──▶ Traefik

VPS (Dokploy, Traefik)
└── project "Workout Logger" / compose service "workout-logger"
    ├── litestream-init  one-shot: restore app.db from R2 if missing   (phase 6)
    ├── litestream       sidecar: streams app.db to R2 (wl-litestream) (phase 6)
    ├── app              Node + Hono: static web build + PWA, /api/status,
    │                    /api/android; later /api (auth, sync, admin),
    │                    scheduled jobs
    └── volume "data":   app.db (SQLite, WAL)                          (phase 6)

Cloudflare R2                                                          (phase 6)
├── wl-litestream/   continuous replica (Litestream token)
└── wl-backups/      daily/, monthly/, pre-migration/ DB copies (app token)
```

- **TLS ends at Cloudflare.** The VPS takes no inbound HTTP: a Cloudflare Tunnel, run by the `cloudflared` app in Dokploy, carries every `*.eerolehtinen.fi` request to Traefik over plain HTTP. A wildcard DNS record and a wildcard tunnel route already exist, so a new hostname needs only a Dokploy domain, with HTTPS and certificates off. Traefik sees cloudflared as the client; the visitor's IP is in `CF-Connecting-IP`.
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

## Static files

`apps/server` serves `apps/web/dist`:

- Everything under `/assets` has a content hash in its name and is sent with `Cache-Control: public, max-age=31536000, immutable`. A missing `/assets` file is a 404.
- Everything else (`index.html`, `sw.js`, the workbox runtime, the manifest, icons) keeps its name across releases and is sent with `no-cache`, so the browser revalidates it and the service worker sees each new version.
- Cloudflare passes these headers through only because of a Cache Rule for `lift.eerolehtinen.fi` (Caching → Cache Rules: hostname equals `lift.eerolehtinen.fi`; Eligible for cache; Edge TTL "use cache-control header if present"; Browser TTL "respect origin"). Without it, the zone's 4-hour Browser Cache TTL rewrites `no-cache` on file types Cloudflare caches (`.js`, images) to `max-age=14400`. Cloudflare's edge still stores `no-cache` files, but revalidates them with the origin on every request.
- The rule makes every response cacheable at the edge, and one without `Cache-Control` is kept for Cloudflare's default TTL (2 h for a 200). So every `/api/*` response is sent with `no-store`. A 404 for a missing asset is kept for 3 minutes, which is harmless.
- Other paths get `index.html`: they are client-side routes. Unknown `/api/*` paths are a JSON 404.

The Playwright tests run against this server, so the headers are tested with
the service worker and offline use.

## Build and release

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml), on push to `main`:

1. `check`: lint, type checks, tests, build, and e2e, as on every branch and PR.
2. `image`: builds the [Dockerfile](../Dockerfile) and pushes it to `ghcr.io/eero-lehtinen/workout-logger`, tagged with the commit SHA. Deployments always use pinned SHA tags, never `latest`, so a rollback is unambiguous.
3. `deploy`: uploads [`deploy/compose.yaml`](../deploy/compose.yaml) with `IMAGE_TAG` replaced by the SHA (`compose.update` in the Dokploy API), queues a deploy (`compose.deploy`), and waits until `/api/status` reports the new commit.

Dokploy's deploy webhooks can't choose a tag (the compose webhook only
redeploys, and the application webhook refuses any tag but the configured
one), so CI uses the API. Its key belongs to a Dokploy member user that can
reach only this service, because Dokploy API keys can't be scoped themselves.

The image is two stages on `node:24-slim`. The build stage installs the
workspace from the lockfile, builds the web app, and `pnpm deploy`s the
server with production dependencies only. The runtime stage holds the server
and `web/dist`, runs as the `node` user, and has a health check on
`/api/status`. Node runs `server/src/main.ts` directly by stripping types.
Node doesn't strip types under `node_modules`, so once the server imports
workspace packages (copied there by `pnpm deploy`), the server needs a bundle
step.

Dokploy pulls the private image with a GHCR registry entry (Settings →
Registry) that uses a classic GitHub token with only `read:packages`.

Planned for phase 6:

1. Server startup, before accepting requests:
   1. Take the pre-migration DB copy to R2 (see [backups.md](backups.md#layers)).
   2. Run migrations: Better Auth tables, `change`, `head`, usage, invites. The single instance has an exclusive DB lock while migrating.

   The health check has a long enough start period that a slow migration doesn't cause a restart loop.

Images are built in CI, not on the VPS, so that builds don't compete with the running server for CPU and RAM.

## Android releases

The Android app is an APK attached to a GitHub release and sideloaded. There is no Play Store listing.

**Releasing.** Push a tag `v<major>.<minor>.<patch>` on a commit of `main`:

```
git tag v0.1.0
git push origin v0.1.0
```

The `android-release` job in `ci.yml` runs after `check`. It builds the web app, syncs it into `apps/android`, builds the release APK with the tag as its version, signs it, verifies the signature, and attaches `workout-logger-<version>.apk` to a GitHub release for the tag (creating the release if it doesn't exist, with the `feat` and `fix` commit subjects since the previous tag as its notes). On other pushes the `android` job builds a debug APK, so the Android build doesn't rot between releases.

A new version must be higher than the installed one: Android refuses to install a lower `versionCode` over a higher one.

**Signing.** Every release is signed with the same key. Android only installs an update over an app signed with the same key; with another key the app must be uninstalled first, which deletes its database. The key therefore must never be lost or replaced.

- The keystore and its password are on the owner's PC in `~/Documents/ai-doc/workout-logger/android-release/` (`release.jks`, `credentials.txt`). Keep a second copy somewhere safe, e.g. in the password manager. The files are never committed.
- CI reads them from GitHub Actions secrets: `ANDROID_KEYSTORE_BASE64` (the keystore file, base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- Certificate SHA-256: `E4:BC:25:34:43:BB:5A:F4:7C:02:9D:F2:AD:C6:45:4E:5F:03:B3:33:84:CF:4B:4D:EB:78:6A:0F:AC:60:57:E1`. `apksigner verify --print-certs <apk>` shows it for a correctly signed APK.

**Updates.** The repository is private, so the app can't read its releases. The server reads them with a token and hands them out:

| Endpoint | Answer |
| --- | --- |
| `GET /api/android/latest` | `{ "version": "1.2.3" }`: the latest release that has an APK. 404 when there is none. |
| `GET /api/android/download` | `{ "version": "1.2.3", "url": "…" }`: GitHub's short-lived signed URL of that APK. The app opens it in the phone's browser. |
| `GET /api/android/apk` | A redirect to the same URL, for a first install from a browser. The download doesn't pass through the VPS either way. |

- All are public, like the web app, and allow CORS from `https://localhost`, the app's WebView origin.
- The app never sends the browser to this site for the download. The browser may have the web app installed, and its service worker answers navigations on this origin with the app shell. The service worker also leaves `/api/*` navigations alone, so the `/apk` link works in such a browser once its service worker has updated.
- The server caches the latest release for 5 minutes, so the public endpoints can't spend the token's rate limit.
- `GITHUB_RELEASES_TOKEN` is a fine-grained GitHub token with read access to the repository's contents only (releases of a private repository need it). Without it both endpoints answer 503, and the app shows no update prompt.
- The first install is the same download: open `https://lift.eerolehtinen.fi/api/android/apk` in the phone's browser and allow the browser to install apps.

**Building locally.** Needs JDK 21 and the Android SDK (`platforms;android-36`, `build-tools;35.0.0`), with `ANDROID_HOME` set or `sdk.dir` in `apps/android/local.properties`.

```
pnpm android:sync
cd apps/android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The debug build has its own application id and database, so it never touches the release app's data. To build a release APK locally, set `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` and run `./gradlew assembleRelease -PappVersion=<version>`.

## Configuration

Set in the image:

| Variable | Purpose |
| --- | --- |
| `GIT_COMMIT` | Commit SHA, a build argument; reported by `/api/status` |
| `PORT` | `3000`; the Dokploy domain points at it |
| `WEB_ROOT` | Optional; defaults to `web/dist` next to the server, as in the repo |

Set as Dokploy environment variables, never committed. `deploy/compose.yaml`
passes each one to the container by name. Only `GITHUB_RELEASES_TOKEN` exists
so far; the rest are phase 6.

| Variable | Purpose |
| --- | --- |
| `GITHUB_RELEASES_TOKEN` | Reads the repository's releases for the Android update endpoints ([Android releases](#android-releases)) |
| `PUBLIC_URL` | Base URL, used for auth and links |
| `AUTH_SECRET` | Better Auth secret. Rotating it probably invalidates all sessions (to verify). |
| `DATABASE_PATH` | `/data/app.db` |
| `BACKUP_R2_*` | Endpoint, bucket, and token for `wl-backups` (app only) |
| `LITESTREAM_R2_*` | Endpoint, bucket, and token for `wl-litestream` (Litestream only) |
| `MIN_CLIENT_VERSION` | Older apps get HTTP 426 "update the app" |

The Dokploy API key of the CI user is the GitHub secret `DOKPLOY_API_KEY`.
The GHCR pull token lives only in Dokploy's registry entry. CI pushes images
with the workflow's own `GITHUB_TOKEN`.

The owner account is created once with `server create-owner --email <email>`,
run via Dokploy's container terminal. The command refuses to run if an owner
already exists. No env var grants the owner role, so nobody can claim it by
signing up first.

## Scheduled jobs

Phase 6. These run in-process with a scheduler library (candidate: `croner`). On
startup, each job checks its last-run time and catches up on a run missed
during downtime.

| Job | Schedule |
| --- | --- |
| Daily DB copy | daily |
| Restore rehearsal | monthly |
| Prune old `usage` rows | daily |

Retention of R2 objects is done with R2 lifecycle rules, not app code.

## Monitoring

- Dokploy container logs, rotated by the json-file log driver in `deploy/compose.yaml` (3 × 10 MB).
- `GET /api/status`: app version and commit now. Phase 6 adds server epoch, DB size, free disk, backup freshness, and the last rehearsal result (see [backups.md](backups.md#visibility)).
- An external uptime monitor on `/api/status` (required). It alerts when the endpoint is down or reports stale backups.
- If Litestream can't upload, the WAL keeps growing. Free disk and Litestream lag on `/api/status` catch this early.

## Recovery procedures

| Situation | Procedure |
| --- | --- |
| Bad deploy without a migration | In GitHub Actions, re-run the `deploy` job of the last good commit's run; it uploads that commit's compose file and SHA. Without GitHub: edit the image tag in the Dokploy compose file and deploy. The next push to `main` deploys again. |
| Bad deploy with a migration | Stop `app`. Restore the `pre-migration/<version>` copy into the volume, or restore Litestream to before the deploy. Run `server new-epoch`. Redeploy the previous SHA. |
| Bad data (wrong edits, buggy client) | Don't restore the DB. Use `wl restore` ([backups.md](backups.md#restore-procedures)). |
| Server DB corrupted | Stop `app`. Run `litestream restore -timestamp <before corruption>` into the volume. If the replica is unusable, use the newest daily copy. Run `server new-epoch`, then start `app`. Devices re-upload whatever the server lost ([sync.md](sync.md#server-restore-and-epoch)). |
| VPS lost | Provision a new VPS, install Dokploy, and run `cloudflared` there with the tunnel token, so the existing DNS and tunnel routes reach it. Create the GHCR registry entry, the CI user and its API key (update `DOKPLOY_API_KEY`), and a raw compose service with the domain and the same env vars; put its id in `ci.yml`. Re-run the last `deploy` job. `litestream-init` restores `app.db` on first start. Run `server new-epoch`. |
| Bad Android release | Delete the GitHub release (or its APK); within 5 minutes the server offers the previous release again. Phones that already installed the bad version can't downgrade: fix forward with a higher version. |
| Android signing key lost | No update can be installed over the existing app. Create a new keystore and secrets, release, and on each phone: export a snapshot (Settings), uninstall, install the new APK, import the snapshot. |
| R2 lost | Data on the VPS is unaffected. Create new buckets and tokens and update the env vars. Litestream starts a fresh replica, and the daily job resumes. The owner's PC copy covers the gap. |
