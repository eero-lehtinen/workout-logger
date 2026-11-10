# Accounts and limits

Status: decided, apart from the quota numbers. The target is a handful of
invited users, not the public. The design should be safe to expose to the
internet, but it isn't hardened for hostile traffic or scale.

## Roles

| Role | Who | Limits | Extra abilities |
| --- | --- | --- | --- |
| `owner` | You | None | Create invites, list users and their usage, change quotas, disable users, run restores. Sees the server's backup status. |
| `user` | Invited users | Quotas below | None |

There are no shared data, teams, or social features. Each account's data is
isolated.

The owner account is created once with a server command, never by signup. See
[deployment.md](deployment.md#configuration).

## Login

- **Library:** Better Auth, pinned (1.7.18), mounted in the Hono server at `/api/auth/*`, storing its tables (`user`, `session`, `account`, `verification`) in the server SQLite database through its Kysely adapter. Its plugin packaging changes between minor versions (e.g. the API-key plugin moved to `@better-auth/api-key`), so check its docs before upgrading.
  - Its admin plugin (roles, ban) is a candidate for the owner features instead of hand-built ones.
  - The role is an extra `role` column on `user` (`owner` or `user`), which sign-in can't set.
- **Method:** GitHub sign-in only. There are no passwords, so no password storage, reset links, or email sending. Other methods may come with invites (phase 11) for users without a GitHub account.
- **No signup.** GitHub sign-up is disabled, so a GitHub sign-in only reaches an account that already exists.
  - The owner account is created with `server create-owner --email <email>` ([deployment.md](deployment.md#configuration)), with the email marked verified.
  - The first GitHub sign-in links GitHub to the account with the same email. Better Auth takes GitHub's public profile email, or the primary email when the profile shows none, and GitHub must report it verified. Better Auth refuses the link if either side is unverified. GitHub isn't a "trusted provider", so an unverified GitHub email never links.
  - A GitHub account without a matching account gets `signup_disabled`, which the app shows as "no account here".
- **Invites** (phase 11): the owner creates invite codes in the admin page. Codes are random with at least 128 bits of entropy, single-use, and expire after 7 days. A code is redeemed in the same transaction that creates the user.
- **Sessions:** 60 days, extended by a day whenever used after a day, so a device that syncs at least every two months stays signed in. Signing out deletes the session on the server.
- **Web sessions:** httpOnly, secure, same-site cookies. The web app is served from the API origin (see [deployment.md](deployment.md#topology)), so cookies work without CORS. Sign-in is a redirect to GitHub and back to Settings; a failed one comes back with `?error=<code>` and shows a toast.
- **Android sessions:** a bearer token (Better Auth's bearer plugin: the session token in `Authorization: Bearer`).
  - The WebView can't host the OAuth flow, because GitHub's callback would navigate it away from the app's origin. The app opens `/api/native-auth/start?app=<application id>&challenge=<S256 of a verifier>` in a Custom Tab (`@capacitor/browser`). The server starts Better Auth's GitHub flow there, with `/api/native-auth/finish` as the callback.
  - `/start` sets a 10-minute httpOnly cookie with the challenge and the start time. `/finish` refuses a flow without it, with another challenge, or with a session older than the start, so a link straight to `/finish` can't hand out a session the browser already had.
  - `/finish` creates a separate session for the app, signs the Custom Tab's own session out, and redirects to `<application id>://auth?code=<one-time code>`. Codes live in server memory for 2 minutes. Only the two application ids (release and debug) are accepted as schemes. Custom Tabs share Chrome's cookies, so signing in on the phone signs Chrome out of the web app.
  - Known risk: another app on the phone can register the same custom scheme. If the user opens an attacker's `/start` link and GitHub skips its consent screen, that app receives a code it can redeem, because the attacker chose the challenge. A verified App Link (`https` return URL with `assetlinks.json`) instead of the custom scheme would close this; it is acceptable for a few invited users with sideloaded apps.
  - The app trades the code and its verifier for the token at `POST /api/native-auth/exchange`. Another app registering the same scheme could catch the code, but can't redeem it without the verifier.
  - Chrome may refuse to open an app from a redirect no tap started (e.g. when GitHub skips its consent screen), so `/finish` answers with a page that redirects by script and also has a "Return to the app" button.
  - The token is stored in Keystore-backed secure storage (`@aparajita/capacitor-secure-storage`), never in `localStorage`. Android Auto Backup is disabled (`allowBackup=false`).
  - Logout calls `POST /api/native-auth/sign-out`, which deletes the session.
- **CORS:** `/api/sync/*`, `/api/me`, `/api/native-auth/*`, and `/api/android/*` allow only the Capacitor Android origin (`https://localhost`), without credentials, with the `Authorization`, `Content-Type`, `X-Client-Version`, and `X-Expected-User` headers. `/api/status` allows it too, for the owner's backup status.
- **Current user:** `GET /api/me` returns `{ id, name, email, image, role }`, or 401.
- **CLI:** personal API keys (Better Auth API-key plugin), created in the app's settings and revocable (phase 10).
  - Read-only by default.
  - Write scope must be granted explicitly and is needed for `wl restore` and imports.
### Without an account

The app works fully without logging in; data stays local. Logging in later
uploads the existing local data: every row is pushed as part of the first
sync. The first upload is exempt from the daily change quota.

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

- Every server table except auth tables has a `user_id` column, and every query filters by the authenticated user. This lives in one data-access module that takes `userId` as a required parameter, so no handler can forget it.
- The sync tables are keyed by `user_id` first. See [sync.md](sync.md#server-side).
- Deterministic row ids (UUIDv5 of builtin keys) repeat across users. This is fine because uniqueness is per user.

## Rate limits and request hygiene

- **Per-IP limits run before auth** on every route. Every request arrives through the Cloudflare Tunnel, so Traefik and the app see cloudflared as the client. The client IP comes from `CF-Connecting-IP`, which Cloudflare sets at its edge ([deployment.md](deployment.md#topology)).
- **Tight limits on auth endpoints:** sign-in and invite redemption. Better Auth's own limiter is on (in memory): 100 requests per minute per IP on `/api/auth/*`, 5 on `/sign-in/*`, and 10 on the OAuth callbacks. It reads the IP from `CF-Connecting-IP`. The per-IP limits on other routes are phase 11.
- **Per-user request rate** applies after auth (quota below).
- **Body size limit** on `/api/sync/v1/push` (1 MB).
- Implementation: an in-memory limiter, which is enough with a single instance. Candidate: `hono-rate-limiter`. Better Auth's own limiter also covers its routes, and must be explicitly enabled outside development.

## Quotas

Defaults for `user`, changeable by the owner per user. The owner has none.

| Quota | Default | Reason |
| --- | --- | --- |
| Changes inserted per day | 2,000 | A heavy session plus routine editing is well under 500. |
| Stored change-log size | 25 MB | About 10 years of normal use. Bounds VPS disk use and backup size. |
| Requests per minute | 60 | Normal sync runs once a minute plus on writes. Stops runaway clients. |
| Snapshot downloads per day | 10 | Snapshots are the most expensive reads. |

Enforcement:

- Only **newly inserted** changes count. Duplicates from retries are free.
- **Exempt:** the first upload after login, the re-upload within 24 h of a server epoch change, and imports run with a write-scoped key the owner has flagged. A snapshot of years of history can exceed the daily limit, so imports need this.
- A push processes changes in order. Once the quota is reached, the remaining changes are rejected individually as `quota` (see [sync.md](sync.md#push)). Local logging keeps working, and the app shows "sync paused: quota reached".
- Counters live in the `usage` table, updated in the push transaction. Old rows are pruned daily.

Quotas exist to protect the shared VPS and the backup buckets from a runaway
client or a misused account.

The owner page shows each user's usage.

## Privacy

- Data is stored unencrypted on the owner's VPS and in the owner's R2 buckets, and the owner can technically read it. Users are told this plainly at signup.
- There is no end-to-end encryption. It would complicate the CLI and server-side restores, and a lost key would mean lost data.
- Users who don't want their data on the server can use the app without an account. They keep backups with file-based exports instead (see [backups.md](backups.md#user-controlled-destinations)).
- **Export:** every user can download a full snapshot of their own data at any time.
- **Account deletion:** a user can delete their account. This immediately hard-deletes their `change` and `head` rows, usage counters, invites, sessions, keys, and auth rows. Copies made before the deletion persist until they expire:
  - Litestream: 14 days
  - daily DB copies: 30 days
  - monthly DB copies: 12 months
  - the owner's PC copy: per its restic retention policy

  The deletion screen states these retention periods.

## Server tables (besides Better Auth's own and the sync tables)

```
job_run (name PK, last_run_at, last_ok_at?, last_error?)   -- scheduled jobs, see deployment.md
invite  (code PK, created_by, created_at, expires_at, used_by?, used_at?)   -- phase 11
usage   (user_id, day, changes_inserted, requests, snapshots, PRIMARY KEY (user_id, day))   -- phase 11
quota   (user_id PK, changes_per_day?, max_bytes?, import_exempt_until?, ...)   -- phase 11; NULL = default
```

The `role` lives on the auth user record. The sync tables (`change`, `head`,
`server_meta`, `user_sync`) are in [sync.md](sync.md#server-side).
