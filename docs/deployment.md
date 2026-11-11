# Deployment

The server runs on the owner's VPS under Dokploy, at
<https://lift.eerolehtinen.fi>. Backups go to Cloudflare R2, a different
provider, so losing either the VPS or the bucket loses no data.

**Current state:** the `app` container serves the static web build,
`GET /api/status`, the Android app's update endpoints
([Android releases](#android-releases), [live updates](#live-updates)),
sign-in, and sync, with its
database on the `data` volume. Litestream replicates the database to R2, and a
daily job copies it there too. Google sign-in, sign-up, and quotas are phase
11 ([accounts.md](accounts.md)); the restore rehearsal is phase 11b.

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
    ├── litestream-init  one-shot: restore app.db from R2 if missing
    ├── litestream       sidecar: streams app.db to R2 (wl-litestream)
    ├── app              Node + Hono: static web build + PWA, /api/status,
    │                    /api/android, /api/auth, /api/native-auth, /api/me,
    │                    /api/sync; scheduled jobs
    ├── volume "data":   app.db (SQLite, WAL)
    └── volume "litestream-run": Litestream's control socket

Cloudflare R2
├── wl-litestream/   continuous replica (Litestream token)
└── wl-backups/      daily/, monthly/, pre-migration/ DB copies (app token)
```

- **TLS ends at Cloudflare.** The VPS takes no inbound HTTP: a Cloudflare Tunnel, run by the `cloudflared` app in Dokploy, carries every `*.eerolehtinen.fi` request to Traefik over plain HTTP. A wildcard DNS record and a wildcard tunnel route already exist, so a new hostname needs only a Dokploy domain, with HTTPS and certificates off. Traefik sees cloudflared as the client; the visitor's IP is in `CF-Connecting-IP`.
- **One container serves both the API and the web app**, so they share an origin. The web uses httpOnly cookie sessions. Android uses bearer tokens (see [accounts.md](accounts.md#login)).
- **Single instance by design.** SQLite has one writer, and the sync protocol relies on it ([sync.md](sync.md#server-side)).
- **Containers** run as the same non-root UID, 1000 (`node` in the app image). Both the app and Litestream must be able to write `app.db`, `-wal`, `-shm`, and Litestream's metadata. `litestream-init` runs as root once, and hands both volumes to uid 1000 after its restore.
- **Server SQLite driver:** better-sqlite3, used through Kysely, which Better Auth also uses. Every query runs on one connection, one at a time.
- **Startup order:** `litestream-init` → `litestream` → `app`.

## Litestream

Litestream 0.5.18 (`litestream/litestream:0.5.18`, the Debian image). The
config is inline in [`deploy/compose.yaml`](../deploy/compose.yaml) as a
compose `configs` entry; `$${VAR}` there leaves the variables for Litestream
to expand at runtime, so the secrets never land in the file.

- **App pragmas:** `journal_mode=WAL`, `busy_timeout=5000`, `synchronous=NORMAL`, `foreign_keys=ON`. Only Better Auth's tables declare foreign keys: deleting a user deletes their sessions and accounts. The sync tables have none. With `NORMAL` a restart of the app, the container, or a cleanly rebooted VPS loses nothing. A host power loss, kernel panic, or hard reset can roll back roughly the last 30 s of commits (Linux's default writeback delay). A push lost that way isn't re-sent, because the device already dropped it from its outbox, and the rolled-back `seq` values get reused, so devices that pulled past them skip later changes. This is accepted as rare; after such a crash, run `new-epoch` so every device re-uploads and pulls again. Auto-checkpoint stays on: Litestream recommends turning it off only for very high write loads, and without it a stopped Litestream would let the WAL grow without bound.
- **Sync interval:** 10 s, to keep R2 write operations low. The R2 free tier allows 1M Class A operations/month.
- **Snapshots:** every 24 h, kept for 72 h (3 days; durations take no days unit). Retention is global in 0.5 (`snapshot.retention`) and limits how far back a point-in-time restore can go. It is short on purpose: every day kept costs a copy of the database in R2 ([accounts.md](accounts.md#account-cap)). Litestream compresses snapshot and incremental pages with LZ4, always; there is no setting for it.
- **R2 lifecycle rule on `wl-litestream`** ([R2 buckets](#r2-buckets)): delete objects older than 5 days. If Litestream stops uploading for that long, the rule deletes the whole replica; the stale-backup alert fires after an hour. R2 may report `DeleteObjects` as done without deleting, so Litestream's own retention can leave files behind.
- **Freshness:** Litestream's Prometheus metrics have no "last upload" timestamp, but its control socket's `GET /list` reports `last_sync_at` per database: the last successful upload, recorded on every sync tick even when nothing changed. The socket is on the shared `litestream-run` volume; the app reads it for `/api/status` (`LITESTREAM_SOCKET`).
- **Init step:** when `/data/app.db` is missing, `litestream restore -if-replica-exists /data/app.db`, and if that restored anything, an empty `/data/app.db.restored`. On a fresh VPS this restores automatically; on an existing one it does nothing. At startup the app sees the marker, starts a new epoch, and deletes the marker, so a restore never serves the old epoch. Any manual restore into the volume can create the same marker instead of running `new-epoch`.
- **Point-in-time restore:** `litestream restore -config /etc/litestream.yml -timestamp <RFC 3339, exclusive> -o <file> /data/app.db`, e.g. from a one-off container of the same image with the same environment.
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
2. `image`: builds the [Dockerfile](../Dockerfile) and pushes it to `ghcr.io/eero-lehtinen/workout-logger`, tagged with the commit SHA. Deployments always use pinned SHA tags, never `latest`, so a rollback is unambiguous. The build signs the Android app's [live-update bundle](#live-updates).
3. `deploy`: uploads [`deploy/compose.yaml`](../deploy/compose.yaml) with `IMAGE_TAG` replaced by the SHA (`compose.update` in the Dokploy API), queues a deploy (`compose.deploy`), and waits until `/api/status` reports the new commit.

Dokploy's deploy webhooks can't choose a tag (the compose webhook only
redeploys, and the application webhook refuses any tag but the configured
one), so CI uses the API. Its key belongs to a Dokploy member user that can
reach only this service, because Dokploy API keys can't be scoped themselves.

The image is two stages on `node:24-slim`. The build stage installs the
workspace from the lockfile, builds the web app, bundles the server, and
`pnpm deploy`s the server package with production dependencies only. The
runtime stage holds the server, `web/dist`, and `web/live-bundle`, runs as
the `node` user, and has a health check on `/api/status`.

The server is bundled with esbuild (`apps/server/build.ts`) into
`dist/main.js` and `dist/cli.js`: Node doesn't strip types under
`node_modules`, where `pnpm deploy` would put the workspace packages. Every
dependency is bundled except better-sqlite3, a native module, which is the
server package's only production dependency; everything else is a dev
dependency. In development, `pnpm start` runs `src/main.ts` directly.

Dokploy pulls the private image with a GHCR registry entry (Settings →
Registry) that uses a classic GitHub token with only `read:packages`.

Server startup, before accepting requests:

1. If a migration is pending and the database already has tables, copy it to `pre-migration/<time>-<first migration>.db.gz` in `wl-backups` ([backups.md](backups.md#layers)). If the copy fails, startup fails and nothing is migrated.
2. Run the server's own migrations (Kysely's migrator), then Better Auth's.

The health check's start period is 2 minutes, so a slow copy or migration
doesn't cause a restart loop.

A deploy fails until every required variable below is set in Dokploy: the
compose file marks them `${VAR:?}`.

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
| `GET /api/android/latest` | `{ "version": "1.2.3" }`: GitHub's latest release, if it has an APK. 404 when it has none; older releases aren't searched. |
| `GET /api/android/download` | `{ "version": "1.2.3", "url": "…" }`: GitHub's short-lived signed URL of that APK. The app opens it in the phone's browser. |
| `GET /api/android/apk` | A redirect to the same URL, for a first install from a browser. The download doesn't pass through the VPS either way. |

- All are public, like the web app, and allow CORS from `https://localhost`, the app's WebView origin.
- The app never sends the browser to this site for the download. The browser may have the web app installed, and its service worker answers navigations on this origin with the app shell. The service worker also leaves `/api/*` navigations alone, so the `/apk` link works in such a browser once its service worker has updated.
- The server caches the latest release for 5 minutes, so the public endpoints can't spend the token's rate limit.
- `GITHUB_RELEASES_TOKEN` is a fine-grained GitHub token with read access to the repository's contents only (releases of a private repository need it). Without it the three endpoints answer 503, and the app shows no update prompt. They answer 502 when GitHub can't be reached. `GITHUB_RELEASES_REPOSITORY` overrides the repository (default `eero-lehtinen/workout-logger`).
- The first install is the same download: in a browser on Android, the web app's Settings show an "Android app" row with a link to `/api/android/apk` when the server has a release. The browser must be allowed to install apps.

**Building locally.** Needs JDK 21 and the Android SDK (`platforms;android-36`, `build-tools;35.0.0`), with `ANDROID_HOME` set or `sdk.dir` in `apps/android/local.properties`.

```
pnpm android:sync
cd apps/android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The debug build has its own application id and database, so it never touches the release app's data. To build a release APK locally, set `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` and run `./gradlew assembleRelease -PappVersion=<version>`.

## Live updates

The Android app replaces its web build without an APK. It downloads the server's web build as a zip and switches to it from the same origin ([architecture.md](architecture.md#live-updates)). A push to `main` reaches a phone in two steps: the app downloads the build when it starts or returns to the front (at most hourly), and switches the next time it goes to the background with no session running, or at its next cold start.

**Bundle.** `pnpm build` runs `apps/web/scripts/build-bundle.ts` after Vite. It writes `apps/web/live-bundle/`, which the image holds as `web/live-bundle`:

- `bundle.zip`: `dist` as it is, about 1.4 MB.
- `manifest.json`: what the first endpoint below answers.

The version is the build's commit, the same value the app has compiled in and shows in Settings → About (`BUILD_COMMIT`, from `buildCommit` in `apps/web/build-info.ts`). A build that knows no commit gets no bundle.

| Endpoint | Answer |
| --- | --- |
| `GET /api/android/bundle` | `{ "version": "<commit>", "minNative": "1.2.3", "checksum": "<SHA-256, hex>", "signature": "<base64>" }`. `signature` is null for an unsigned build. 404 when the build has no bundle. |
| `GET /api/android/bundle/<version>.zip` | The zip. 404 for any version but the current one, so a deploy between the app's two requests can't hand it the wrong build. |

Both are public, allow CORS from `https://localhost`, and need no GitHub token. The download passes through the VPS.

**When an APK is still needed.** A web build runs in every shell from `minNative` on. That is `MIN_NATIVE` in `apps/web/build-info.ts`. Raise it to the next release's version in the change that makes the web code depend on something only that APK has:

- a Capacitor plugin the web code newly calls, or a new method or event of `RestTimer`;
- a native setting the web code relies on: a permission, the manifest, the Capacitor config;
- a new signing key for live updates (below).

A shell below `minNative` keeps its web build, and the APK prompt offers the release, so tag the release when such a change lands on `main`. A change in `apps/android` that the web code doesn't depend on needs a release to reach phones, but no higher `minNative`. Installing an APK puts the phone back on the web build inside it; the next start downloads the server's build again.

**Signing.** The app only installs a bundle whose signature (RSA with SHA-256 over the zip) verifies against the public key in `apps/web/capacitor.config.ts`. A compromised VPS or Cloudflare account therefore can't run code in the app; whoever can build a signed bundle can, which is the same trust as the APK's signing key in GitHub Actions.

- The private key is on the owner's PC in `~/Documents/ai-doc/workout-logger/android-release/live-update-private.pem`, next to the APK keystore, and is never committed. Keep a second copy with the keystore's.
- CI reads it from the GitHub Actions secret `LIVE_UPDATE_PRIVATE_KEY` (the PEM file's content) and passes it to the image build as a BuildKit secret, so it is in no image layer. The `image` job fails without the secret: an unsigned bundle would deploy fine and every phone would refuse it.
- The build fails if the key doesn't match the public key in the app config.
- Builds without the key, such as local ones and CI's `check` job, make an unsigned bundle. To test live updates against a local server, set `LIVE_UPDATE_PRIVATE_KEY` for `pnpm build`.
- The signature covers the zip, not the manifest. A server could at worst hand out an older signed build, or claim a `minNative` that keeps phones from updating.

**A bundle that fails.** A bundle that doesn't open the database and render within 20 s of foreground time is rolled back by the shell and never downloaded again; the phone waits for the next commit ([architecture.md](architecture.md#live-updates)). A bundle that starts but misbehaves is a bad deploy ([recovery procedures](#recovery-procedures)).

## Configuration

Set in the image:

| Variable | Purpose |
| --- | --- |
| `GIT_COMMIT` | Commit SHA, a build argument; reported by `/api/status`, and baked into the web build for Settings → About and as the version of its live-update bundle |
| `PORT` | `3000`; the Dokploy domain points at it |
| `WEB_ROOT` | Optional; defaults to `web/dist` next to the server, as in the repo |
| `BUNDLE_ROOT` | Optional; defaults to `web/live-bundle` next to the server, as in the repo |

Set as Dokploy environment variables, never committed. `deploy/compose.yaml`
passes each one to its container by name; the required ones are marked
`${VAR:?}`, so a deploy without them fails instead of starting without
backups or sign-in.

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | Better Auth's secret, e.g. `openssl rand -base64 32`. It signs the session cookies: rotating it signs every browser out. Android tokens keep working. |
| `SIGN_IN_PROVIDERS` | Phase 11. The enabled sign-in providers, comma-separated: `google`, `github`. Defaults to `google`. Each one listed needs its client id and secret below; startup fails without them. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Phase 11. The Google OAuth client ([below](#google-oauth-client)) |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | The GitHub OAuth app ([below](#github-oauth-app)). Required until phase 11; then only when `SIGN_IN_PROVIDERS` lists `github`. |
| `BACKUP_R2_ENDPOINT`, `BACKUP_R2_BUCKET`, `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY` | `wl-backups` and the app's token for it. The endpoint is `https://<account id>.r2.cloudflarestorage.com`. |
| `LITESTREAM_R2_ENDPOINT`, `LITESTREAM_R2_BUCKET`, `LITESTREAM_R2_ACCESS_KEY_ID`, `LITESTREAM_R2_SECRET_ACCESS_KEY` | `wl-litestream` and Litestream's token, for `litestream` and `litestream-init` only |
| `MIN_CLIENT_VERSION` | Optional. Android apps below it get HTTP 426 "update the app". |
| `MAX_ACCOUNTS` | Phase 11. Optional; the [account cap](accounts.md#account-cap), default 30, the owner included. |
| `GITHUB_RELEASES_TOKEN` | Optional. Reads the repository's releases for the Android update endpoints ([Android releases](#android-releases)) |

Set by the compose file: `PUBLIC_URL` (`https://lift.eerolehtinen.fi`, for
auth callbacks) and `LITESTREAM_SOCKET`. The image sets `DATABASE_PATH`
(`/data/app.db`). Unset, `DATABASE_PATH` is `data/app.db` relative to the
working directory, and `PUBLIC_URL` is `http://localhost:<port>`. A missing
`AUTH_SECRET` fails startup with `NODE_ENV=production`, and falls back to a
fixed development secret otherwise. Without the GitHub OAuth variables the
server starts with sign-in off and logs a warning, which is enough for local
runs without sign-in.

The Dokploy API key of the CI user is the GitHub secret `DOKPLOY_API_KEY`.
The GHCR pull token lives only in Dokploy's registry entry. CI pushes images
with the workflow's own `GITHUB_TOKEN`. The other GitHub secrets are the
Android keystore's ([Android releases](#android-releases)) and
`LIVE_UPDATE_PRIVATE_KEY` ([live updates](#live-updates)).

### Google OAuth client

Phase 11. Google Cloud console → APIs & Services, in a project owned by the
owner's Google account:

- OAuth consent screen: external, scopes `openid`, `email`, `profile` only, privacy policy `https://lift.eerolehtinen.fi/privacy`, published to production. Check at setup that these basic scopes still need no verification.
- Credentials → OAuth client ID, type Web application. Authorized redirect URIs: `https://lift.eerolehtinen.fi/api/auth/callback/google`, and for local development `http://localhost:5173/api/auth/callback/google`.

**Switching the owner from GitHub:** deploy with `SIGN_IN_PROVIDERS=google,github`,
sign in with Google on every device (it links to the owner account by email),
then set `SIGN_IN_PROVIDERS=google`. Existing sessions and Android tokens keep
working. If the owner's Google email isn't the account's, run `set-email` first
([the server command](#the-server-command)).

### GitHub OAuth app

Used while `SIGN_IN_PROVIDERS` lists `github`. GitHub → Settings → Developer
settings → OAuth Apps, owned by the owner's account:

- Homepage URL: `https://lift.eerolehtinen.fi`
- Authorization callback URL: `https://lift.eerolehtinen.fi/api/auth/callback/github`

Its client id and a client secret go into the variables above. For local
development, a second OAuth app with `http://localhost:5173` and
`http://localhost:5173/api/auth/callback/github`, used with `PUBLIC_URL=http://localhost:5173`
for `pnpm start` and `pnpm dev` (whose proxy forwards `/api`).

### R2 buckets

Two buckets in the owner's Cloudflare account, in the default (automatic)
location and Standard storage, which is what the free tier covers:

- `wl-litestream`, with an R2 API token that has Object Read & Write on that bucket only, for the `LITESTREAM_R2_*` variables.
- `wl-backups`, with another such token on that bucket only, for the `BACKUP_R2_*` variables.

Their lifecycle rules are in [`deploy/r2/`](../deploy/r2/), one file per
bucket. CI doesn't apply them. After creating a bucket, or after changing a
file, apply it with a Wrangler signed in to the owner's account:

```
npx wrangler r2 bucket lifecycle set wl-litestream --file deploy/r2/wl-litestream.lifecycle.json
npx wrangler r2 bucket lifecycle set wl-backups --file deploy/r2/wl-backups.lifecycle.json
npx wrangler r2 bucket lifecycle list wl-backups
```

`set` replaces the bucket's whole configuration. Without the rules, R2 keeps
every copy and the free tier runs out ([accounts.md](accounts.md#account-cap)).
The `wl-litestream` expiry must stay longer than Litestream's
`snapshot.retention` plus a day, or restores lose the newest snapshot.

### The `server` command

`dist/cli.js` in the image, run from Dokploy's terminal of the `app`
container (`node server/dist/cli.js <command>`), or `node apps/server/src/cli.ts`
in the repo. It opens the same database as the server, migrating it first if
needed.

- `create-owner --email <email> [--name <name>]` creates the owner account once, with the email marked verified. The owner then signs in with the GitHub account whose email it is: the public profile email, or the primary email when the profile shows none, verified on GitHub. The command refuses to run if an owner exists. No env var grants the owner role, so nobody can claim it by signing in first.
- `new-epoch` ends a whole-database restore ([sync.md](sync.md#server-restore-and-epoch)).
- `set-email --user <id or email> --email <email>` (phase 11) changes an account's email, marked verified, so the next sign-in with a provider reporting that email links to it.

## Scheduled jobs

These run in-process with `croner`, in UTC. Each run is recorded in the
`job_run` table. On startup, a job whose last good run is older than its
period runs right away, which catches up on a run missed during downtime.

| Job | Schedule | Status |
| --- | --- | --- |
| Daily DB copy (`daily-db-copy`) | 03:00 | Runs when `BACKUP_R2_*` is set |
| Restore rehearsal | monthly | Phase 11b |
| Prune `usage` rows older than 90 days | daily | Phase 11, with quotas |

Retention of R2 objects is done with R2 lifecycle rules, not app code
([R2 buckets](#r2-buckets)).

## Monitoring

- Dokploy container logs, rotated by the json-file log driver in `deploy/compose.yaml` (3 × 10 MB).
- `GET /api/status`: `{ version, commit, backupsOk }` for anyone. `backupsOk` is false when a configured backup layer is stale: the Litestream replica's last upload is over 1 h old, or the last good daily copy is over 2 days old. The owner (signed in) also gets the server epoch, the database and free disk size, each layer's last success and whether it is stale, and the daily copy's last error ([backups.md](backups.md#visibility)).
- An external uptime monitor on `/api/status` (required). It alerts when the endpoint is down or doesn't contain `"backupsOk":true`.
- If Litestream can't upload, the WAL keeps growing. Free disk and the replica's age on `/api/status` catch this early.

## Recovery procedures

| Situation | Procedure |
| --- | --- |
| Bad deploy without a migration | In GitHub Actions, re-run the `deploy` job of the last good commit's run; it uploads that commit's compose file and SHA. Without GitHub: edit the image tag in the Dokploy compose file and deploy. The next push to `main` deploys again. Android apps follow the server back to that build as they do forward. |
| Bad web build with a domain schema migration | Fix forward. Browsers and phones that ran the bad build have migrated their database, and an older build refuses a newer database ("Update the app") until a build with that schema version is deployed. |
| Live-update bundle doesn't start on phones | Nothing to do on the phone: it rolls back and never downloads that commit again. Push a fix. |
| Bad deploy with a migration | Stop `app`. Restore the deploy's `pre-migration/` copy (gunzip it to `/data/app.db`) into the volume, or restore Litestream to before the deploy. Run `new-epoch` with the previous SHA's image ([the server command](#the-server-command)). Redeploy the previous SHA. |
| Bad data (wrong edits, buggy client) | Don't restore the DB. Import an earlier snapshot file with "Replace everything" on one device; it syncs out ([backups.md](backups.md#restore-procedures)). |
| VPS crashed (power loss, kernel panic, hard reset) | Once it is back, run `new-epoch`: the last seconds of commits may be gone ([Litestream](#litestream)), and devices re-upload them. Not needed after a clean reboot or a container restart. |
| Server DB corrupted | Stop `app` and `litestream`. Run `litestream restore -timestamp <before corruption>` into the volume. If the replica is unusable, use the newest daily copy: gunzip it to `/data/app.db`. Either way, first delete the old `app.db-wal`, `app.db-shm`, and `.app.db-litestream` (an old WAL would be applied to the restored file), and create an empty `/data/app.db.restored` so the app starts a new epoch. Start the stack; `litestream-init` hands the files to uid 1000. Devices re-upload whatever the server lost ([sync.md](sync.md#server-restore-and-epoch)). Accounts and sessions created after the copy are gone: users sign in again, and an account created after it must be created again with a new id, so its devices ask to merge (choose Merge). |
| VPS lost | Provision a new VPS, install Dokploy, and run `cloudflared` there with the tunnel token, so the existing DNS and tunnel routes reach it. Create the GHCR registry entry, the CI user and its API key (update `DOKPLOY_API_KEY`), and a raw compose service with the domain and the same env vars; put its id in `ci.yml`. Re-run the last `deploy` job. `litestream-init` restores `app.db` on first start, and the app starts a new epoch itself. |
| Bad Android release | Delete the GitHub release; within 5 minutes the server offers the previous release again. Deleting only its APK stops all update offers instead. Phones that already installed the bad version can't downgrade: fix forward with a higher version. |
| Android signing key lost | No update can be installed over the existing app. Create a new keystore and secrets, release, and on each phone: export a snapshot (Settings), uninstall, install the new APK, import the snapshot. |
| Live-update signing key lost or leaked | Create a key pair (`openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072`, `openssl pkey -pubout`). Put the public key in `apps/web/capacitor.config.ts` and the private key in `LIVE_UPDATE_PRIVATE_KEY`, raise `MIN_NATIVE` to the next version, and release an APK. Older apps stay on their web build until they install it. A leaked key is only useful to someone who also controls the server or the connection to it. |
| R2 lost | Data on the VPS is unaffected. Create new buckets and tokens, apply the lifecycle rules ([R2 buckets](#r2-buckets)), and update the env vars. Litestream starts a fresh replica, and the daily job resumes. The owner's PC copy (phase 10) covers the gap; until then, devices hold every account's full state. |
