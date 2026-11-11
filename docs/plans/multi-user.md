# Plan: multi-user (phase 11)

Let a few invited people other than the owner use the server, with quotas.
The design is in the docs, marked *(phase 11)* where it isn't built:

- [accounts.md](../accounts.md): Google sign-in and the provider flag, invites, rate limits, quotas, the admin page, account deletion, the tables.
- [sync.md](../sync.md#server-side): the quota hook in `push`, 429 and 403 in the sync loop.
- [deployment.md](../deployment.md#configuration): the new variables, the Google OAuth client, `set-email`, the pruning job.

This file holds only what is specific to doing the work. It is deleted when
the phase is done, after removing the *(phase 11)* marks.

Out of scope: the restore rehearsal, the R2 token check, and the old-snapshot
warning dot (phase 11b). Data export already exists.

## Order

One PR each; each deploys on its own.

1. **Google sign-in.** `SIGN_IN_PROVIDERS`, the Google provider, `signIn` in `/api/status` and the buttons, the `provider` parameter of native auth, `set-email`. Then switch the owner on the live server ([deployment.md](../deployment.md#google-oauth-client)).
2. **Request limits.** Per-IP and per-user limits, body limits.
3. **Quotas.** The tables with the `stored` backfill, the `core` push hook, `epoch_started_at`, snapshot counting, exemptions, pruning, `/api/me/usage` and the Settings rows. Run the long fuzz test.
4. **Invites and sign-up.** The table, the start endpoint, the user-create hook, the invite page, `/privacy`.
5. **Admin page.** Invites, users, usage, quota overrides, exemption windows, disable.
6. **Account deletion.**
7. **Onboard the first invited user**, which is the exit: invite, sign-up in their browser, Android install and sign-in, a logged session that syncs.

## Risks to check first

- **Invite claim in Better Auth's transaction.** Better Auth 1.7.18 runs `createOAuthUser` in `runWithTransaction` and the user-create hooks inside it. The claim must use that transaction: our own Kysely instance shares the one better-sqlite3 connection and would wait on it. Try declaring `invite` as a plugin schema and writing it through `getCurrentAdapter`; the first test is two concurrent redemptions of one code.
- **`hono-rate-limiter`:** check that it is maintained and supports Hono 4 before adopting it; otherwise a fixed-window map.
- **Google consent screen:** check that basic scopes still publish without verification.

## Tests

- Server: sign-up without an invite is refused; expired, used, and revoked codes are refused; two concurrent redemptions create one user; a refused sign-up leaves no user or account row; `create-owner` still works.
- Server: push over the daily limit rejects the rest as `quota`, duplicates stay `ok`, the owner is unlimited, each exemption window lifts the daily limit and not the storage one; the snapshot limit; `stored` equals `sum(length(data))` after pushes; pruning.
- Server: per-IP and per-user 429s; body limits; admin routes refuse a non-owner; disable removes sessions and refuses sign-in; deletion removes every row of that user and none of another's.
- `SYNC_FUZZ_RUNS=5000 pnpm test fuzz` after the `core` push change.
- Stories: the invite page (valid, invalid), `/privacy`, the admin page, the deletion dialog, the quota rows in Settings.
- e2e: a user over a small quota sees sync pause, and resume after an exemption, through the real server.
- By hand: Google sign-in on the web and in the Android app; the owner's Google sign-in links to the existing account.
