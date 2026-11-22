# Open questions

Items to decide. Once an item is decided, move the result into the relevant
doc and delete it here.

## Deferred

1. **Quota numbers** in [accounts.md](accounts.md#quotas) and the account cap. Tune them once there is real usage data from the owner account. The default quotas are code constants; the cap and per-user overrides change on the admin page. In 2026-11 the owner's whole history, imported from FitNotes, was 6,947 rows and 1.1 MB of stored data, against the 10 MB storage default.

2. **Data protection** ([privacy.md](privacy.md)):
   - **netcup's data processing agreement.** Check in its Customer Control Panel that it exists, or create it: Master Data → Order Processing → Create AV Contract.
   - **R2 location.** The buckets use the automatic location, which is a placement, not a promise. Only a bucket created with the `eu` jurisdiction guarantees storage in the EU, and an existing bucket can't be changed: it means new buckets, tokens, and endpoints (`<account id>.eu.r2.cloudflarestorage.com`).
   - **A record of consent.** The app asks for consent before sign-in, but the server stores no record of it and accepts a sign-up that skipped the app. Recording it means carrying the answer through the OAuth flow, on the web and on Android, into a column on `user`, and asking accounts that have none.
   - **Deletions and restores.** A whole-database restore from a daily or monthly copy brings back accounts their users deleted since. Replaying them needs a list of deleted account ids that outlives the backups and is itself restored from a newer source.
   - **Unused accounts** are kept until their owner deletes them. A purge after some years without a sync would fit storage limitation better, but the server can't warn anyone first: it sends no email.
   - **Data the server doesn't need.** Better Auth stores Google's OAuth tokens in `account`, the profile picture URL in `user`, and each browser sign-in's IP address and user agent in `session`. Nothing reads them. Dropping them needs hooks on Better Auth's writes and a cleanup of the stored rows.

The order of work is in [implementation-plan.md](implementation-plan.md).
