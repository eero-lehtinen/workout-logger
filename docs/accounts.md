# Accounts and limits

Status: decided, apart from the quota numbers. The target is a handful of coworkers, not the public. The
design should be safe to expose to the internet, but it isn't hardened for
hostile traffic or scale.

## Roles

| Role | Who | Limits | Extra abilities |
| --- | --- | --- | --- |
| `owner` | You | None | Create invites, list users and their usage, change quotas, disable users, reset passwords, run server restores. |
| `user` | Invited coworkers | Quotas below | None |

There are no shared data, teams, or social features. Each account's data is
isolated.

## Login

- **Library:** Better Auth (*candidate*), mounted in the Hono server at `/api/auth/*`, storing its tables in D1.
- **Method:** email + password. This needs no email-sending infrastructure.
- **Password reset:** the owner generates a reset link by hand. This is a shortcut that is acceptable at this scale.
- **Later:** Google/GitHub OAuth, or magic links if we add an email provider.
- **Signup:** invite-only. The owner creates a single-use invite code in the admin page, and signup requires one. This prevents strangers from using the free-tier quota.
- **App and Android sessions:** bearer tokens (Better Auth bearer plugin), stored on the device.
  - Cookies are avoided because the Capacitor WebView origin differs from the API origin.
  - The token is long-lived and refreshed on use. Logout revokes it.
- **CLI:** personal API keys (Better Auth API-key plugin), created in the app's settings. They are read-only by default, and revocable.

### Without an account

The app works fully without logging in; data stays local. Logging in later
uploads the existing local data: every row is pushed as part of the first
sync.

Logging out keeps the local data, but stops sync.

Logging in as a *different* account on a device that holds data asks first:
discard local data, or merge it into the new account.

## Data scoping

- Every server table except auth tables has a `user_id` column, and every query filters by the authenticated user. This lives in one data-access module that takes `userId` as a required parameter, so no handler can forget it.
- The sync change log is keyed by `(user_id, table_name, id, hlc)` and indexed by `(user_id, seq)`. See [sync.md](sync.md#server-side).
- Deterministic row ids (UUIDv5 of builtin keys) repeat across users. This is fine because uniqueness is per user.

## Quotas

Defaults for `user`, changeable by the owner per user. The owner has none.

| Quota | Default | Reason |
| --- | --- | --- |
| Changes pushed per day | 2,000 | A heavy session plus routine editing is well under 500. A FitNotes import of years of history exceeds this, so the first import gets a one-time allowance. |
| Stored change-log size | 25 MB | About 10 years of normal use. Keeps total D1 usage far below the 500 MB database limit. |
| Requests per minute | 60 | Normal sync runs once a minute plus on writes. Stops runaway clients. |
| Snapshot downloads per day | 10 | Snapshots are the most expensive reads. |

Enforcement:

- **Changes and size:** per-user counters in a `usage` table, updated in the push transaction. Over-quota pushes get HTTP 429 with the quota name. The app shows "sync paused: quota reached", and local logging keeps working.
- **Request rate:** a Cloudflare rate-limiting binding, or a simple fixed-window counter in D1.
- **Account-wide guard:** if total D1 writes for the day approach the free-plan limit (100k rows written/day), `user` pushes are refused before `owner` pushes are.

The owner page shows each user's usage.

## Privacy

- Data is stored unencrypted in D1/R2 on the owner's Cloudflare account, and the owner can technically read it. Users are told this plainly at signup.
- There is no end-to-end encryption. It would complicate the CLI, server-side restores, and password reset (a lost key means lost data).
- Users who don't want their data on the server can use the app without an account. They keep backups with file-based exports instead (see [backups.md](backups.md#user-controlled-destinations)).
- **Account deletion:** a user can delete their account. This hard-deletes their change log, usage counters, and auth rows, and removes their data from future snapshots. Older snapshots expire with retention.
- **Export:** every user can download a full snapshot of their own data at any time (see [backups.md](backups.md)).

## Server tables (besides Better Auth's own)

```
invite  (code PK, created_by, created_at, used_by?, used_at?)
change  (seq PK, user_id, table_name, id, hlc, deleted, v, data, device_id, received_at,
         UNIQUE (user_id, table_name, id, hlc))
usage   (user_id, day, changes_pushed, requests, PRIMARY KEY (user_id, day))
quota   (user_id PK, changes_per_day?, max_bytes?, ...)   -- NULL = default
```

The `role` lives on the auth user record.
