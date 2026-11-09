# Accounts and limits

Status: decided, apart from the quota numbers. The target is a handful of
coworkers, not the public. The design should be safe to expose to the
internet, but it isn't hardened for hostile traffic or scale.

## Roles

| Role | Who | Limits | Extra abilities |
| --- | --- | --- | --- |
| `owner` | You | None | Create invites, list users and their usage, change quotas, disable users, issue password reset links, run restores. |
| `user` | Invited coworkers | Quotas below | None |

There are no shared data, teams, or social features. Each account's data is
isolated.

The owner account is created once with a server command, never by signup. See
[deployment.md](deployment.md#configuration).

## Login

- **Library:** Better Auth (*candidate*), mounted in the Hono server at `/api/auth/*`, storing its tables in the server SQLite database. Pin the version; its plugin packaging changes between minor versions (e.g. the API-key plugin moved to `@better-auth/api-key`).
  - Its admin plugin (roles, ban, set password) is a candidate for the owner features instead of hand-built ones.
- **Method:** email + password. This needs no email-sending infrastructure.
- **Signup:** invite-only.
  - The owner creates invite codes in the admin page. Codes are random with at least 128 bits of entropy, single-use, and expire after 7 days.
  - A code is redeemed in the same transaction that creates the user.
- **Password reset:** the owner generates a reset link and sends it out-of-band.
  - Links are single-use and expire after 1 h.
  - A completed reset revokes all of the user's sessions and API keys.
- **Web sessions:** httpOnly, secure, same-site cookies. The web app is served from the API origin (see [deployment.md](deployment.md#topology)), so cookies work without CORS.
- **Android sessions:** bearer tokens (Better Auth bearer plugin).
  - The token is stored in Keystore-backed secure storage through a Capacitor plugin, never in `localStorage`.
  - Android Auto Backup is disabled (`allowBackup=false`).
  - The token is long-lived and refreshed on use. Logout revokes it.
- **CORS:** allow only the Capacitor Android origin (`https://localhost` by default, to verify against the pinned Capacitor version), without credentials, and expose the `set-auth-token` header.
- **CLI:** personal API keys (Better Auth API-key plugin), created in the app's settings and revocable.
  - Read-only by default.
  - Write scope must be granted explicitly and is needed for `wl restore` and imports.
- **Later:** Google/GitHub OAuth, or magic links if an email provider is added. OAuth inside the Capacitor WebView needs deep links or custom tabs.

### Without an account

The app works fully without logging in; data stays local. Logging in later
uploads the existing local data: every row is pushed as part of the first
sync. The first upload is exempt from the daily change quota.

Logging out keeps the local data, but stops sync.

Logging in as a *different* account on a device that holds data asks first:
discard local data, or merge it into the new account.

## Data scoping

- Every server table except auth tables has a `user_id` column, and every query filters by the authenticated user. This lives in one data-access module that takes `userId` as a required parameter, so no handler can forget it.
- The sync tables are keyed by `user_id` first. See [sync.md](sync.md#server-side).
- Deterministic row ids (UUIDv5 of builtin keys) repeat across users. This is fine because uniqueness is per user.

## Rate limits and request hygiene

- **Per-IP limits run before auth** on every route. The client IP comes from `X-Forwarded-For` only when the request arrives through Traefik (a trusted proxy setting); otherwise the header is ignored.
- **Tight limits on auth endpoints:** sign-in, sign-up, invite redemption, and password reset. For example, 5 per minute per IP.
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
- **Exempt:** the first upload after login, the re-upload within 24 h of a server epoch change, and imports run with a write-scoped key the owner has flagged. FitNotes history can exceed the daily limit, so imports need this.
- A push processes changes in order. Once the quota is reached, the remaining changes are rejected individually as `quota` (see [sync.md](sync.md#push)). Local logging keeps working, and the app shows "sync paused: quota reached".
- Counters live in the `usage` table, updated in the push transaction. Old rows are pruned daily.

Quotas exist to protect the shared VPS and the backup buckets from a runaway
client or a misused account.

The owner page shows each user's usage.

## Privacy

- Data is stored unencrypted on the owner's VPS and in the owner's R2 buckets, and the owner can technically read it. Users are told this plainly at signup.
- There is no end-to-end encryption. It would complicate the CLI, server-side restores, and password reset (a lost key means lost data).
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
invite  (code PK, created_by, created_at, expires_at, used_by?, used_at?)
usage   (user_id, day, changes_inserted, requests, snapshots, PRIMARY KEY (user_id, day))
quota   (user_id PK, changes_per_day?, max_bytes?, import_exempt_until?, ...)   -- NULL = default
```

The `role` lives on the auth user record. The sync tables (`change`, `head`,
`server_meta`, `user_sync`) are in [sync.md](sync.md#server-side).
