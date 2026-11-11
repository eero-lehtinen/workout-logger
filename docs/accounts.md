# Accounts and limits

Status: decided, apart from the quota numbers. The target is a handful of
users the owner knows, not the public; the app isn't advertised. The design
should be safe to expose to the internet, but it isn't hardened for hostile
traffic or scale.

Parts marked *(phase 11)* aren't built yet; the order of work is in
[plans/multi-user.md](plans/multi-user.md).

## Roles

| Role | Who | Limits | Extra abilities |
| --- | --- | --- | --- |
| `owner` | You | None | The [admin page](#admin-page): users, usage, quotas, disable, delete. Sees the server's backup status. |
| `user` | Everyone else | [Quotas](#quotas) | None |

There are no shared data, teams, or social features. Each account's data is
isolated.

The owner account is created once with a server command, never by sign-up. See
[deployment.md](deployment.md#configuration).

## Login

- **Library:** Better Auth, pinned (1.7.18), mounted in the Hono server at `/api/auth/*`, storing its tables (`user`, `session`, `account`, `verification`) in the server SQLite database through its Kysely adapter. Its plugin packaging changes between minor versions (e.g. the API-key plugin moved to `@better-auth/api-key`), so check its docs before upgrading.
  - Its admin plugin is not used: it brings its own `admin` role, needs custom access control for `owner`, and covers only users and bans. The [admin page](#admin-page) is hand-built.
  - The role is an extra `role` column on `user` (`owner` or `user`), which sign-in can't set. `disabled` *(phase 11)* is another such column.
- **Method:** Google sign-in *(phase 11; GitHub until then)*. There are no passwords, so no password storage, reset links, or email sending.
  - `SIGN_IN_PROVIDERS` lists the enabled providers (`google`, `github`; default `google`). GitHub stays in the code behind it. `GET /api/status` reports the list as `signIn`, and the app shows one sign-in button per entry. *(phase 11; today the server reads only the GitHub variables, and the app has one GitHub button)*
  - Google uses `prompt: "select_account"`, so a phone with several Google accounts asks which one. Google refuses OAuth inside WebViews; the Android flow below runs in a Custom Tab.
- **Linking by email.** The first sign-in with a provider links it to the account with the same email. The provider must report the email verified, and so must the account: Better Auth refuses the link otherwise, and no provider is "trusted" to skip that. GitHub's email is the public profile email, or the primary one when the profile shows none.
  - The owner account is created with `server create-owner --email <email>` ([deployment.md](deployment.md#configuration)), with the email marked verified.
  - `server set-email` *(phase 11)* changes an account's email, e.g. when the owner's Google email differs from the GitHub one.
- **Sign-up** *(phase 11; until then GitHub sign-up is disabled)*: signing in with a provider account that has no account here creates one, until the [account cap](#account-cap) is reached.
- **Sessions:** 60 days, extended by a day whenever used after a day, so a device that syncs at least every two months stays signed in. Signing out deletes the session on the server.
- **Web sessions:** httpOnly, secure, same-site cookies. The web app is served from the API origin (see [deployment.md](deployment.md#topology)), so cookies work without CORS. Sign-in is a redirect to the provider and back to Settings; a failed one comes back with `?error=<code>` and shows a toast.
- **Android sessions:** a bearer token (Better Auth's bearer plugin: the session token in `Authorization: Bearer`).
  - The WebView can't host the OAuth flow, because the provider's callback would navigate it away from the app's origin. The app opens `/api/native-auth/start?app=<application id>&challenge=<S256 of a verifier>&provider=<provider>` in a Custom Tab (`@capacitor/browser`). The server starts Better Auth's flow for that provider there, with `/api/native-auth/finish` as the callback. *(The `provider` parameter is phase 11; until then it is always GitHub.)*
  - `/start` sets a 10-minute httpOnly cookie with the challenge and the start time. `/finish` refuses a flow without it, with another challenge, or with a session older than the start, so a link straight to `/finish` can't hand out a session the browser already had.
  - `/finish` creates a separate session for the app, signs the Custom Tab's own session out, and redirects to `<application id>://auth?code=<one-time code>`. Codes live in server memory for 2 minutes. Only the two application ids (release and debug) are accepted as schemes. Custom Tabs share Chrome's cookies, so signing in on the phone signs Chrome out of the web app.
  - Known risk: another app on the phone can register the same custom scheme. If the user opens an attacker's `/start` link and the provider skips its consent screen, that app receives a code it can redeem, because the attacker chose the challenge. A verified App Link (`https` return URL with `assetlinks.json`) instead of the custom scheme would close this; it is acceptable for a few users with sideloaded apps.
  - The app trades the code and its verifier for the token at `POST /api/native-auth/exchange`. Another app registering the same scheme could catch the code, but can't redeem it without the verifier.
  - Chrome may refuse to open an app from a redirect no tap started (e.g. when the provider skips its consent screen), so `/finish` answers with a page that redirects by script and also has a "Return to the app" button.
  - The token is stored in Keystore-backed secure storage (`@aparajita/capacitor-secure-storage`), never in `localStorage`. Android Auto Backup is disabled (`allowBackup=false`).
  - Logout calls `POST /api/native-auth/sign-out`, which deletes the session.
- **CORS:** `/api/sync/*`, `/api/me`, `/api/native-auth/*`, and `/api/status` (for the owner's backup status) allow only the Capacitor Android origin (`https://localhost`), without credentials, with the `Authorization`, `Content-Type`, `X-Client-Version`, and `X-Expected-User` headers. Their preflight answer may be cached for 2 hours (`Access-Control-Max-Age`), so a sync doesn't cost an extra round trip. `/api/android/*` allows that origin with Hono's default methods and headers.
- **Current user:** `GET /api/me` returns `{ id, name, email, image, role }`, or 401. A disabled account gets 403 `account_disabled` *(phase 11)*; the app shows "This account is disabled" in Settings and stops syncing, and local data stays.
- **CLI:** personal API keys (Better Auth API-key plugin), created in the app's settings and revocable (phase 10).
  - Read-only by default.
  - Write scope must be granted explicitly and is needed for `wl restore` and imports.

### Account cap

*(phase 11)*

There are no invites. The app isn't advertised, so few strangers will find
it, and the owner can disable or delete any account. What needs a limit is
the total, because every account's data is copied many times into R2.

- `MAX_ACCOUNTS` (default 30, the owner included) caps the number of accounts.
- `databaseHooks.user.create.before` counts the accounts and refuses at the cap with `signup_closed` ("No new accounts at the moment"). A creation outside a request (`create-owner`) passes. Better Auth creates the user and the provider account in one transaction (`createOAuthUser`) and runs the hook inside it, on the server's single SQLite connection, so two sign-ups can't both take the last place.
- The sign-in row says that signing in creates an account, and links the [privacy notice](#privacy). The app, browser or Android, signs up the same way it signs in.
- Sign-up lands on Settings with a welcome toast. Data logged on the device before sign-up uploads in the first sync, within the [24-hour exemption](#quotas).

**Why 30.** The binding limit is R2's free tier, 10 GB of storage, which
other projects on the account share; about 8 GB is left for this server.
Once retention fills, R2 holds about 3–6× the server database: Litestream
keeps ~4 daily snapshots and 3 days of incremental files, compressed with LZ4,
and the daily job keeps 7 daily and 3 monthly gzipped copies
([backups.md](backups.md#layers)). A model with synthetic data gives 3×;
the owner's real data compresses worse. Even at 6×, the database can grow to
about 1.3 GB. The owner's 2.5 years of FitNotes history was a 2.8 MB
Litestream snapshot and a 1.3 MB daily copy while the server also kept every
version in a log; keeping only the newest version in a `WITHOUT ROWID` table
makes it about a third of that
([sync.md](sync.md#why-only-the-newest-version)). Assume 0.5 MB of database
per active user per year: 30 accounts take decades to fill the budget, so the
cap is about strangers, not storage, and could rise. The
[storage quota](#quotas) bounds a runaway account. Everything else is far from a limit: Litestream's R2 writes are
bounded by its sync interval (at most ~350k of the 1M free Class A operations
a month, whatever the user count), and the VPS and the Cloudflare Tunnel
carry a few hundred MB of SQLite and a sync a minute per open app without
effort. The owner's status warns when the database passes 700 MB.

Retention is short because the data isn't critical: a whole-database restore
reaches back 3 days point-in-time, 7 days by daily copy, and 3 months by
monthly copy. Each device holds its account's full state, and Android keeps a
snapshot file of each of the last 10 sessions.

### Without an account

The app works fully without logging in; data stays local. Logging in later
uploads the existing local data: every row is pushed as part of the first
sync.

Logging out keeps the local data, but stops sync. The device remembers which
account its data belongs to (`user_id` in `_sync_state`), so signing in
again with the same account just continues.

Signing in as a *different* account than the device last synced with asks
first, and sync waits for the answer:

- **Merge:** every local row is queued for upload into the new account, and the device bootstraps from that account's snapshot. LWW merges the two.
- **Discard:** the dialog first says how many local changes never reached the server. The app then saves a snapshot file of the device (a download in a browser, `Documents/WorkoutLogger/` on Android), which Import snapshot can bring back; if that fails, nothing is discarded. Then the device's synced tables, outbox, and undo history are emptied, the catalog is re-seeded, and the new account's data is pulled. Nothing is pushed for the discarded rows; the other account keeps its copy on the server.
- **Sign out** instead.

The Settings screen shows the account, the last sync time, the number of
unsynced changes, and why sync is stuck, if it is.

## Data scoping

- Every server table that holds user data, apart from Better Auth's own, has a `user_id` column, and every query filters by the authenticated user. This lives in one data-access module that takes `userId` as a required parameter, so no handler can forget it.
- The one exception is the `admin` module *(phase 11)*, which reads across users for the [admin page](#admin-page). Only `/api/admin/*` uses it, behind a check that the session is the owner's.
- The sync tables are keyed by `user_id` first. See [sync.md](sync.md#server-side).
- Deterministic row ids (UUIDv5 of builtin keys) repeat across users. This is fine because uniqueness is per user.

## Rate limits and request hygiene

- **Per IP, before auth** *(phase 11)*: 300 requests per minute on `/api/*`, enough for several devices behind one NAT. Static files aren't limited.
- **Client IP:** every request arrives through the Cloudflare Tunnel, so Traefik and the app see cloudflared as the client. The client IP comes from `CF-Connecting-IP`, which Cloudflare sets at its edge ([deployment.md](deployment.md#topology)); without it (local runs) the socket address. The VPS takes no inbound HTTP, so only another container on the Dokploy network could set the header itself. That is accepted.
- **Auth endpoints:** Better Auth's own limiter is on (in memory): 100 requests per minute per IP on `/api/auth/*`, 5 on `/sign-in/*`, and 10 on the OAuth callbacks. It reads the IP from `CF-Connecting-IP`.
- **Per user, after auth** *(phase 11)*: the request quota below. 429 with `Retry-After`; the sync loop counts it as a failed run and tries again in a minute.
- **Body size:** 1 MB on `/api/sync/v1/push`; 64 KB on every other `/api/*` POST *(phase 11)*.
- Implementation: in-memory limiters, which are enough with a single instance. Candidate: `hono-rate-limiter`, checked against Hono 4 when adopted. Better Auth's limiter must be explicitly enabled outside development.

## Quotas

*(phase 11)*

Defaults for `user`, changeable by the owner per user. The owner has none.

| Quota | Default | Reason |
| --- | --- | --- |
| Bytes written per day | 5 MB of `data` | Every stored version passes through the WAL into Litestream's incremental files, which R2 keeps for 3 days; this bounds that churn. A heavy session plus routine editing writes well under 200 KB. |
| Stored data size | 10 MB of `data` | About 10 years of active use. Keeps one account from taking the [R2 budget](#account-cap). Check the ratio of database size to stored `data` on the live server before fixing the number. |
| Requests per minute | 60 | Normal sync runs once a minute plus on writes. Stops runaway clients. |
| Snapshot downloads per day | 10 | Snapshots are the most expensive reads. |

Enforcement:

- Both limits count bytes of `data`, not rows: what costs disk and R2 is size, and a row count would treat a setting and a long note alike.
- Only versions the server **stores** count toward bytes written: ones newer than the stored row. Duplicates from retries and versions that already lost are free.
- The push checks and records the bytes inside its own transaction (a hook of `push` in `core`, see [sync.md](sync.md#server-side)), so two devices of one user can't overrun the limit together. Stored bytes are `sum(length(data))` of the user's `head` rows, read at the start of the push. Once either limit is reached, the remaining changes are rejected individually as `quota`. Local logging keeps working.
- **Exempt from the daily limit**, never from the storage limit:
  - the first 24 h after the account is created, for the upload of data logged before sign-up;
  - the first 24 h after a server epoch change, for the re-upload;
  - until `quota.exempt_until`, which the owner sets for 24 h from the admin page, e.g. before a user imports a snapshot of years of history.
- A snapshot over the daily limit gets 429 `quota`.
- The request limit is counted in memory only.
- `GET /api/me/usage` returns today's bytes written and the stored bytes with their limits. Settings shows them under Sync, and names the limit that paused sync: the daily limit (resumes tomorrow) or storage (ask the owner).
- `usage` rows older than 90 days are pruned daily.

Quotas exist to protect the shared VPS and the backup buckets from a runaway
client or a misused account.

## Admin page

*(phase 11)*

`/admin` in the web app, linked from Settings for the owner, over
`/api/admin/*` (403 for anyone else).

- **Users:** name, email, created, last sync (the newest `received_at` in `head`), bytes written today, stored bytes. Per user: edit quota overrides, allow unlimited uploads for 24 h, disable or enable, delete.
- **Disable** sets `disabled`, deletes the user's sessions, and `session.create.before` refuses new ones (`account_disabled` on the sign-in redirect).
- **Delete** is the same as the user's own [account deletion](#privacy).

## Privacy

- Data is stored unencrypted on the owner's VPS and in the owner's R2 buckets, and the owner can technically read it. The sign-in row in Settings says this plainly and links to a `/privacy` page *(phase 11)* with this section's content; the Google consent screen links to it too.
- There is no end-to-end encryption. It would complicate the CLI and server-side restores, and a lost key would mean lost data.
- Users who don't want their data on the server can use the app without an account. They keep backups with file-based exports instead (see [backups.md](backups.md#user-controlled-destinations)).
- **Export:** every user can save a full snapshot of their own data at any time with Settings → Export snapshot. A synced device holds the account's full state, so the export is of the device.
- **Account deletion** *(phase 11)*: a user can delete their account in Settings. The dialog states what is deleted and the retention periods below, offers Export snapshot first, and asks for the account's email typed in.
  - `DELETE /api/me` hard-deletes, in one transaction, the user's `head`, `user_sync`, `usage`, and `quota` rows, then the `user` row, whose foreign keys delete the sessions and provider accounts. Better Auth's own `deleteUser` isn't used: without a password it needs a session younger than a day, and Android sessions last 60 days.
  - The owner can't delete their own account.
  - The device keeps its local data and signs out. Signing in with another account later asks to merge or discard, as for any account change.
  - Copies made before the deletion persist until they expire:
    - Litestream: 3 days
    - daily DB copies: 7 days
    - monthly DB copies: 3 months
    - pre-migration copies: 14 days
    - the owner's PC copy: per its restic retention policy

## Server tables (besides Better Auth's own and the sync tables)

```
job_run (name PK, last_run_at, last_ok_at?, last_error?)   -- scheduled jobs, see deployment.md
usage   (user_id, day, bytes_written, snapshots,
         PRIMARY KEY (user_id, day))                        -- phase 11
quota   (user_id PK, bytes_per_day?, max_bytes?, requests_per_minute?,
         snapshots_per_day?, exempt_until?)                 -- phase 11; NULL = default
```

`role` and `disabled` live on the auth user record. The sync tables (`head`,
`server_meta`, `user_sync`) are in [sync.md](sync.md#server-side).
