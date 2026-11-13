# Accounts and limits

Status: decided, apart from the quota numbers. The target is a handful of
users the owner knows, not the public; the app isn't advertised. The design
should be safe to expose to the internet, but it isn't hardened for hostile
traffic or scale.

## Roles

| Role | Who | Limits | Extra abilities |
| --- | --- | --- | --- |
| `owner` | You | None | The [admin page](#admin-page): users, usage, quotas, disable, delete, ban. Sees the server's backup status. |
| `user` | Everyone else | [Quotas](#quotas) | None |

There are no shared data, teams, or social features. Each account's data is
isolated.

The owner account is created once with a server command, never by sign-up. See
[deployment.md](deployment.md#configuration).

## Login

- **Library:** Better Auth, pinned (1.7.18; the server also uses `@better-auth/core`'s IP normalization, pinned to the same version), mounted in the Hono server at `/api/auth/*`, storing its tables (`user`, `session`, `account`, `verification`) in the server SQLite database through its Kysely adapter. Its plugin packaging changes between minor versions (e.g. the API-key plugin moved to `@better-auth/api-key`), so check its docs before upgrading.
  - Its admin plugin is not used: it brings its own `admin` role, needs custom access control for `owner`, and covers only users and bans. The [admin page](#admin-page) is hand-built.
  - The role is an extra `role` column on `user` (`owner` or `user`), which sign-in can't set. `disabled` is another such column.
- **Method:** Google sign-in. There are no passwords, so no password storage, reset links, or email sending.
  - `SIGN_IN_PROVIDERS` lists the enabled providers (`google`, `github`; default `google`). GitHub stays in the code behind it. `GET /api/status` reports the list as `signIn`, and the app shows one sign-in button per entry, Google first. The app remembers the last list, so the buttons show offline.
  - Google uses `prompt: "select_account"`, so a phone with several Google accounts asks which one. Google refuses OAuth inside WebViews; the Android flow below runs in a Custom Tab.
- **Linking by email.** The first sign-in with a provider links it to the account with the same email. The provider must report the email verified, and so must the account: Better Auth refuses the link otherwise, and no provider is "trusted" to skip that. GitHub's email is the public profile email, or the primary one when the profile shows none.
  - The owner account is created with `server create-owner --email <email>` ([deployment.md](deployment.md#configuration)), with the email marked verified.
  - `server set-email` changes an account's email, e.g. when the owner's Google email differs from the GitHub one.
- **Sign-up:** signing in with a provider account that has no account here creates one, until the [account cap](#account-cap) is reached.
- **Sessions:** 60 days, extended by a day whenever used after a day, so a device that syncs at least every two months stays signed in. Signing out deletes the session on the server.
- **Web sessions:** httpOnly, secure, same-site cookies. The web app is served from the API origin (see [deployment.md](deployment.md#topology)), so cookies work without CORS. Sign-in is a redirect to the provider and back to Settings; a failed one comes back with `?error=<code>` and shows a toast.
- **Android sessions:** a bearer token (Better Auth's bearer plugin: the session token in `Authorization: Bearer`).
  - The WebView can't host the OAuth flow, because the provider's callback would navigate it away from the app's origin. The app opens `/api/native-auth/start?app=<application id>&challenge=<S256 of a verifier>&provider=<provider>` in a Custom Tab (`@capacitor/browser`). The server starts Better Auth's flow for that provider there, with `/api/native-auth/finish` as the callback. A provider that isn't enabled is a 400; without `provider`, as from a web build older than the parameter, the first enabled one is used.
  - `/start` sets a 10-minute httpOnly cookie with the challenge and the start time. `/finish` refuses a flow without it, with another challenge, or with a session older than the start, so a link straight to `/finish` can't hand out a session the browser already had.
  - `/finish` creates a separate session for the app, signs the Custom Tab's own session out, and redirects to `<application id>://auth?code=<one-time code>`. Codes live in server memory for 2 minutes. Only the two application ids (release and debug) are accepted as schemes. Custom Tabs share Chrome's cookies, so signing in on the phone signs Chrome out of the web app.
  - Known risk: another app on the phone can register the same custom scheme. If the user opens an attacker's `/start` link and the provider skips its consent screen, that app receives a code it can redeem, because the attacker chose the challenge. A verified App Link (`https` return URL with `assetlinks.json`) instead of the custom scheme would close this; it is acceptable for a few users with sideloaded apps.
  - The app trades the code and its verifier for the token at `POST /api/native-auth/exchange`. Another app registering the same scheme could catch the code, but can't redeem it without the verifier.
  - Chrome may refuse to open an app from a redirect no tap started (e.g. when the provider skips its consent screen), so `/finish` answers with a page that redirects by script and also has a "Return to the app" button.
  - The token is stored in Keystore-backed secure storage (`@aparajita/capacitor-secure-storage`), never in `localStorage`. Android Auto Backup is disabled (`allowBackup=false`).
  - Logout calls `POST /api/native-auth/sign-out`, which deletes the session.
- **CORS:** `/api/sync/*`, `/api/me` and below it, `/api/admin/*`, `/api/native-auth/*`, and `/api/status` (for the owner's backup status) allow only the Capacitor Android origin (`https://localhost`), without credentials, with `GET`, `POST`, `PUT`, and `DELETE`, and the `Authorization`, `Content-Type`, `X-Client-Version`, and `X-Expected-User` headers. Their preflight answer may be cached for 2 hours (`Access-Control-Max-Age`), so a sync doesn't cost an extra round trip. `/api/android/*` allows that origin with Hono's default methods and headers.
- **Current user:** `GET /api/me` returns `{ id, name, email, image, role }`, or 401. A disabled account gets 403 `account_disabled` on every route behind sign-in; the app shows "This account is disabled" in Settings, and local data stays. Disabling also ends the account's sessions, so its devices usually see 401 first and then a refused sign-in.
- **CLI:** personal API keys (Better Auth API-key plugin), created in the app's settings and revocable. Not built yet.
  - Read-only by default.
  - Write scope must be granted explicitly and is needed for `wl restore` and imports.

### Account cap

There are no invites. The app isn't advertised, so few strangers will find
it, and the owner can disable, delete, or [ban](#bans) any account. What
needs a limit is the total, because every account's data is copied many
times into R2.

- The cap is 100 accounts, the owner included, changeable on the [admin page](#admin-page) without a deploy.
- `databaseHooks.user.create.before` counts the accounts and refuses at the cap with `signup_closed` ("No new accounts at the moment"; a 403 from id-token sign-in, `?error=signup_closed` on the OAuth redirect). A creation outside a request (`create-owner`) passes. Better Auth creates the user and the provider account in one transaction and runs the hook inside it, on the server's single SQLite connection, so two sign-ups can't both take the last place. That needs `transaction: true` in its database options: without it Better Auth runs the two inserts without a transaction.
- The hook counts through Better Auth's adapter, which joins the transaction, and reads the cap from the server's in-memory copy of `limits`: a query on the server's own Kysely instance would wait for the connection the transaction holds.
- The sign-in row says that signing in creates an account, that synced data is not encrypted, and links the [privacy notice](#privacy). The app, browser or Android, signs up the same way it signs in.
- Sign-up lands on Settings with a welcome toast: Better Auth sends a new user to `newUserCallbackURL` (`/settings?welcome=1`; for Android, `/finish` passes `welcome=1` on to the deep link). Data logged on the device before sign-up uploads in the first sync, within the [daily limit](#quotas), which fits a whole account.

**Why 100.** The binding limit is R2's free tier, 10 GB of storage, which
other projects on the account share; about 8 GB is left for this server.
Once retention fills, R2 holds about 4–5× the server database: Litestream
keeps ~4 daily snapshots and 3 days of incremental files, compressed with LZ4,
and the daily job keeps 7 daily and 3 monthly Brotli-compressed copies
([backups.md](backups.md#layers)). The database is about 1.8× the stored
`data`, and an active user adds about 1 MB of it a year, plus a fixed ~0.2 MB
for the built-in catalog: roughly 5 MB of R2 per account per year, so 8 GB
holds about 1,500 account-years and 100 accounts last over a decade. The cap
is sized for realistic use, not for every account filling its
[storage quota](#quotas): a full 20 MB quota is about 90 MB of R2, so even a
third of the accounts at their quota stays near 3 GB. The quota bounds a
runaway account, the database warning below gives months of notice, and R2
beyond the free tier costs cents. The cap itself mostly bounds strangers, if
the app is ever found. Everything else is far from a limit: Litestream's R2 writes are
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
- The one exception is the `admin` module (`apps/server/src/admin.ts`), which reads across users for the [admin page](#admin-page). Only `/api/admin/*` uses it, behind a check that the session is the owner's.
- The sync tables are keyed by `user_id` first. See [sync.md](sync.md#server-side).
- Deterministic row ids (UUIDv5 of builtin keys) repeat across users. This is fine because uniqueness is per user.

## Rate limits and request hygiene

- **Per IP, before auth**: 300 requests per minute on `/api/*`, enough for several devices behind one NAT. Static files and CORS preflights aren't counted. 429 `rate_limited` with `Retry-After`.
- **Client IP:** every request arrives through the Cloudflare Tunnel, so Traefik and the app see cloudflared as the client. The client IP comes from `CF-Connecting-IP`, which Cloudflare sets at its edge ([deployment.md](deployment.md#topology)); without it (local runs) the socket address. The VPS takes no inbound HTTP, so only another container on the Dokploy network could set the header itself. That is accepted. IPv6 clients are counted by their /64, as Better Auth does, since one subscriber usually has a whole /64 to rotate addresses in.
- **Auth endpoints:** Better Auth's own limiter is on (in memory): 100 requests per minute per IP on `/api/auth/*`, 5 on `/sign-in/*`, and 10 on the OAuth callbacks. It reads the IP from `CF-Connecting-IP`. `/api/native-auth/start` starts the sign-in from the server, past Better Auth's limiter, so it has its own limit of 5 per minute per IP.
- **Sign-in state:** every sign-in start stores its OAuth state in Better Auth's `verification` table before anyone has signed in. Better Auth deletes a row only when a callback looks it up, so the server deletes expired ones every hour ([scheduled jobs](deployment.md#scheduled-jobs)).
- **Cookie requests:** a page on a sibling `*.eerolehtinen.fi` subdomain is same-site, so the browser sends it the `SameSite=Lax` session cookie. Every `/api/*` request that carries a cookie must therefore come from the app's own origin (`PUBLIC_URL`), checked with Hono's `csrf` middleware on `Sec-Fetch-Site` or `Origin`; others get 403. Bearer-token requests aren't checked: a page can't send a token it doesn't know.
- **Per user, after auth**: the request quota below, on `/api/me` and `/api/sync/*`. The owner has none. 429 `rate_limited` with `Retry-After`; the sync loop counts it as a failed run, says so in Settings, and tries again in a minute.
- **Body size:** 1 MB on `/api/sync/v1/push`; 64 KB on every other `/api/*` request, including Better Auth's. 413 `too_large`.
- Implementation: `hono-rate-limiter` (0.5, Hono 4) with its in-memory store, which is enough with a single instance (`apps/server/src/limits.ts`). Better Auth's limiter must be explicitly enabled outside development.

## Quotas

The owner has none. Every other account gets the defaults below, constants in
the server code, unless the owner sets an override for it on the
[admin page](#admin-page).

| Quota | Default | Reason |
| --- | --- | --- |
| Bytes written per day | 20 MB, the stored data size | Every stored version passes through the WAL into Litestream's incremental files, which R2 keeps for 3 days; this bounds that churn. It equals the storage limit, so a whole account fits in one day: the first upload after sign-up, the re-upload after a server restore, or a snapshot import. There are no exemptions. A heavy session plus routine editing writes well under 500 KB. |
| Stored data size | 20 MB | About 10 years of active use. Keeps one account from taking the [R2 budget](#account-cap). |
| Requests per minute | 60 | Normal sync runs once a minute plus on writes. Stops runaway clients. |
| Snapshot downloads per day | 10 | Snapshots are the most expensive reads. |

Enforcement:

- Both limits count bytes, about what a row takes in the database (`rowBytes` in `core`): the UTF-8 bytes of `data`, plus the table name and id, plus 200 bytes for the rest of the row and its index entry. What costs disk and R2 is size, and a row count would treat a setting and a long note alike. Without the fixed part, rows with empty `data` would be nearly free, and one account could fill the disk with millions of them. A typical row counts about twice its `data`. MB here is 1024².
- Only versions the server **stores** count toward bytes written: ones newer than the stored row. Duplicates from retries and versions that already lost are free.
- The push checks and records the bytes inside its own transaction (a hook of `push` in `core`, see [sync.md](sync.md#server-side)), so two devices of one user can't overrun the limit together. Stored bytes are the sum of the user's `head` rows' bytes, read at the start of the push; a replaced row counts its new size, not both. Once a change doesn't fit either limit, it and the rest of the push's new versions are rejected as `quota`. Only growth counts against storage, so a user over a lowered limit can still sync changes that shrink their data. Local logging keeps working.
- Days are UTC: the daily limits reset at 00:00 UTC (`usage.day`).
- A snapshot over the daily limit gets 429 `quota`, and Settings says sync resumes tomorrow.
- The request limit is counted in memory only.
- `GET /api/me/usage` returns `{ day, bytesWritten, bytesPerDay, storedBytes, maxBytes, snapshots, snapshotsPerDay }`, limits null when unlimited. Settings shows the stored and uploaded bytes under Sync ("Server storage"), fetched at startup and on account changes and refreshed after each sync run while Settings is open, and names the limit that paused sync: the daily limit (resumes tomorrow) or storage (ask the owner). The server doesn't say which limit refused a change, so the app names the one with less room left.
- `usage` rows older than 90 days are pruned daily.

Quotas exist to protect the shared VPS and the backup buckets from a runaway
client or a misused account.

## Admin page

`/admin` in the web app ("Admin"), linked from Settings for the owner, over
`/api/admin/*` (403 for anyone else). The Settings row shows a stale server
backup or a database over 700 MB instead of its description.

- **Server:** the database size (with a warning over 700 MB), free disk, and each [backup layer](backups.md#visibility): when it last succeeded, whether it is stale, and the last errors of the daily copy, the two restore rehearsals, and the token check, from the owner's `/api/status`. A failed rehearsal or token check shows as "Failed". Below them, the size of the DB copies in `wl-backups`, per key prefix, from `GET /api/admin/backup-storage`.
- **Account cap:** edited next to the number of accounts. Empty uses the built-in 100. Lowering it below the number of accounts only stops new sign-ups.
- **Users:** name, email, created, last sync (the newest `received_at` in `head`), bytes written today, stored bytes; a search box filters them by name and email. Per user, in a sheet: edit quota overrides (bytes in MB; empty uses the default), disable or enable, delete, ban. None of these apply to the owner's own account.
- **Banned accounts:** below the users, when there are any: name, email, and when banned, each with an Unban button.
- `GET /api/admin/users` (with the cap, the account count, and the bans); `GET /api/admin/backup-storage`, `{ bytes, objects, groups }` or null without a backup bucket; `PUT /api/admin/limits` with `{ maxAccounts }`, a number or null; `PUT /api/admin/users/:id/quota` with all four overrides, each a number or null; `POST /api/admin/users/:id/disable`, `/enable`, `/ban`; `DELETE /api/admin/users/:id`; `DELETE /api/admin/bans/:id` (the banned account's id).
- **Disable** sets `disabled`, deletes the user's sessions, and `session.create.before` refuses new ones (`account_disabled` on the sign-in redirect, and as a toast in the app).
- **Delete** is the same as the user's own [account deletion](#privacy).
- **Ban** is a delete that also keeps the person from signing up again ([Bans](#bans)).

### Bans

Disable keeps an account and its data, which still count toward the
[account cap](#account-cap); Delete frees both, but the same provider account
can sign up again. A ban does both: it deletes the account and refuses it at
sign-up.

- In one transaction, the ban records the account's name, email, and creation time in `ban`, its ban keys in `ban_key`, and deletes the account as [account deletion](#privacy) does.
- **Ban keys:** `email:<email>`, lowercased, and `account:<provider>:<id>` for each linked provider account (Google's `sub`, GitHub's user id). The provider id catches a provider account whose email changed, e.g. a GitHub profile email.
- `databaseHooks.user.create.before` refuses a banned email, and `databaseHooks.account.create.before` a banned provider account, both with `account_disabled`: to the person, a banned account looks disabled, and every sign-in path already shows that code. The account hook runs inside the sign-up's transaction, so a refused sign-up leaves no user behind. It also refuses linking a banned provider account to another account with the same email.
- The hooks read the ban keys from the server's in-memory copy (`LimitCache`), for the same reason as the cap. The ban and unban endpoints refresh it.
- **Unban** deletes the `ban` and `ban_key` rows. The person can then sign up again, as a new account without the old data.
- Known limit: a different Google or GitHub account with an email not banned gets through. Accounts are free to create; the ban only stops the same identity.

## Privacy

- Data is stored unencrypted on the owner's VPS and in the owner's R2 buckets, and the owner can technically read it. The sign-in row in Settings says the data is not encrypted and links to a `/privacy` page with this section's content. Settings → About links to it whether signed in or not, and the Google consent screen links to it too.
- There is no end-to-end encryption. It would complicate the CLI and server-side restores, and a lost key would mean lost data.
- Users who don't want their data on the server can use the app without an account. They keep backups with file-based exports instead (see [backups.md](backups.md#user-controlled-destinations)).
- **Export:** every user can save a full snapshot of their own data at any time with Settings → Export snapshot. A synced device holds the account's full state, so the export is of the device.
- **Account deletion**: a user can delete their account in Settings (Delete account, shown while the server can be reached). The dialog states what is deleted and the retention periods below, offers Export snapshot first, and asks for the account's email typed in.
  - `DELETE /api/me` with `{ email }`, which must match the account's (400 otherwise), hard-deletes, in one transaction, the user's `head`, `user_sync`, `usage`, and `quota` rows, then the `user` row, whose foreign keys delete the sessions and provider accounts. Better Auth's own `deleteUser` isn't used: without a password it needs a session younger than a day, and Android sessions last 60 days. The owner's admin page deletes another account the same way (`DELETE /api/admin/users/:id`).
  - The server database runs with `secure_delete`, so the deleted rows don't stay readable in free pages of `app.db`, which Litestream would otherwise copy into each new snapshot until SQLite reuses them ([deployment.md](deployment.md#litestream)).
  - The owner can't delete their own account.
  - A [ban](#bans) keeps the name, email, and provider account ids on the server, so sign-up can refuse them, until the owner lifts it.
  - The device keeps its local data and signs out. Signing in with another account later asks to merge or discard, as for any account change.
  - Copies made before the deletion persist until they expire:
    - Litestream: 3 days
    - daily DB copies: 7 days
    - monthly DB copies: 3 months
    - pre-migration copies: 14 days

## Server tables (besides Better Auth's own and the sync tables)

```
job_run (name PK, last_run_at, last_ok_at?, last_error?)   -- scheduled jobs, see deployment.md
usage   (user_id, day, bytes_written, snapshots,
         PRIMARY KEY (user_id, day)) WITHOUT ROWID          -- day: YYYY-MM-DD, UTC
quota   (user_id PK, bytes_per_day?, max_bytes?, requests_per_minute?,
         snapshots_per_day?)                                -- NULL = the default
limits  (id PK CHECK (id = 1), max_accounts?)              -- one row; NULL = 100
ban     (user_id PK, name, email, created_at)              -- the deleted account's id
ban_key (user_id, key, PRIMARY KEY (user_id, key))
        WITHOUT ROWID                                      -- email:… or account:<provider>:<id>
```

A quota for an account is its `quota` override, else the default from the
code. The per-minute request limiter reads the overrides from memory, and so
do the sign-up hooks the cap and the ban keys (`LimitCache`); the admin
endpoints refresh that copy when they write.

`role` and `disabled` live on the auth user record. The sync tables (`head`,
`server_meta`, `user_sync`) are in [sync.md](sync.md#server-side).
