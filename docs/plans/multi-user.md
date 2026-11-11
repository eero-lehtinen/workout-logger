# Plan: multi-user (phase 11)

Let a few people other than the owner use the server, with quotas. The
design is in the docs, marked *(phase 11)* where it isn't built:

- [accounts.md](../accounts.md): Google sign-in and the provider flag, sign-up and the account cap, rate limits, quotas, the admin page, account deletion, the tables.
- [sync.md](../sync.md#server-side): the quota hook in `push`, 429 and 403 in the sync loop.
- [deployment.md](../deployment.md#configuration): the new variables, the Google OAuth client, `set-email`, the pruning job.

This file holds only what is specific to doing the work. It is deleted when
the phase is done, after removing the *(phase 11)* marks.

Out of scope: the restore rehearsal, the R2 token check, and the old-snapshot
warning dot (phase 11b). Data export already exists.

## Order

One commit each, on one branch for the phase. Each commit passes `pnpm check`
on its own.

0. **Head-only server sync.** The server keeps only `head`, `WITHOUT ROWID`, with a `seq` counter; migration `0003_sync_head_only` drops `change` ([sync.md](../sync.md#server-side)). Done, and the 5,000-run fuzz test passes. After the deploy, compare the size of the next `daily/` copy with the last one: dropping `change` frees pages but doesn't shrink `app.db` itself until a `VACUUM`, while the daily copy is made with `VACUUM INTO`.
1. **Google sign-in.** `SIGN_IN_PROVIDERS`, the Google provider, `signIn` in `/api/status` and the buttons, the `provider` parameter of native auth, `set-email`. Sign-up stays off. Done. Before the branch deploys, create the Google OAuth client and set `GOOGLE_CLIENT_*` and `SIGN_IN_PROVIDERS=google,github` in Dokploy; after, switch the owner on the live server ([deployment.md](../deployment.md#google-oauth-client)).
2. **Request limits.** Per-IP and per-user limits, body limits. Done.
3. **Quotas.** The tables (`usage`, `quota`, `limits`), the default quotas as code constants with per-user overrides, the `core` push hook, `epoch_started_at`, snapshot counting, exemptions, pruning, `/api/me/usage` and the Settings rows. Done.
4. **Admin page.** The account cap, users, usage, quota overrides, exemption windows, disable, the 700 MB database warning. Done.
5. **Account deletion.** Done.
6. **Sign-up.** The account cap from `limits`, the user-create hook, the sign-in row's notice, `/privacy`. Last, so nobody can sign up before quotas, the admin page, and deletion exist. Done.
7. **Google sign-in on the live server**, which is the exit: the owner signs in with Google on the web and in the Android app, and it links to the existing account.

## Risks to check first

- **Counting accounts in Better Auth's transaction.** Better Auth 1.7.18 runs `createOAuthUser` in `runWithTransaction` and the user-create hooks inside it. The count must use that transaction (`getCurrentAdapter`): our own Kysely instance shares the one better-sqlite3 connection and would wait on it. First test: two concurrent sign-ups for the last place create one user.
- **Storage quota calibration.** Before fixing the 10 MB, compare the live database size with `sum(length(data))` of `head`.
- **Google consent screen:** check that basic scopes still publish without verification.

## Tests

- Server: sign-up below the cap creates a user and its provider account; at the cap it is refused with `signup_closed` and leaves no rows; two concurrent sign-ups for the last place create one user; `create-owner` works at the cap; an existing account signs in at the cap.
- Server: push over the daily bytes-written limit rejects the rest as `quota`, duplicates and older versions stay `ok` and cost nothing, the owner is unlimited, each exemption window lifts the daily limit and not the storage one; the storage limit counts a replaced row's new size, not both versions; the snapshot limit; pruning.
- Server: per-IP and per-user 429s; body limits; admin routes refuse a non-owner; disable removes sessions and refuses sign-in; deletion removes every row of that user and none of another's.
- `SYNC_FUZZ_RUNS=5000 pnpm test fuzz` after the `core` push change.
- Stories: the sign-in row with its notice, `/privacy`, the admin page, the deletion dialog, the quota rows in Settings.
- e2e: a user over a small quota sees sync pause, and resume after an exemption, through the real server.
- By hand: Google sign-in and sign-up on the web and in the Android app; the owner's Google sign-in links to the existing account.
