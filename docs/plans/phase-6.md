# Phase 6 rollout

The code for phase 6 is done: the server (GitHub sign-in, sync, migrations,
DB copies, status), the client sync loop and Settings UI, the Android sign-in,
and the compose file with Litestream. What's left needs the owner's accounts
and the VPS. Delete this file once every item is done and the phase is marked
`[done]` in [implementation-plan.md](../implementation-plan.md).

## Before merging to `main`

Pushing `main` deploys, and the compose file refuses to start without these
variables (`${VAR:?}`), so set them first.

1. **GitHub OAuth app** for production ([deployment.md](../deployment.md#github-oauth-app)). Note its client id and a client secret.
2. **R2** ([backups.md](../backups.md#storage-isolation)):
   - buckets `wl-litestream` and `wl-backups`;
   - one API token per bucket with Object Read & Write on that bucket only;
   - lifecycle rules: `wl-litestream` everything older than 16 days; `wl-backups` `daily/` after 30 days, `monthly/` after 365 days, `pre-migration/` after 90 days.
3. **Dokploy** environment of the `workout-logger` compose service: `AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, the four `BACKUP_R2_*`, and the four `LITESTREAM_R2_*` ([deployment.md](../deployment.md#configuration)). Keep `GITHUB_RELEASES_TOKEN`.
4. Check that Dokploy's Docker Compose supports `configs` with `content:` (Compose 2.23.1+). If not, mount `litestream.yml` with Dokploy's file mounts instead and update the compose file and deployment.md.

## After the first deploy

1. In the `app` container's terminal: `node server/dist/cli.js create-owner --email <email>`, where the email is the GitHub account's public profile email, or its primary email if the profile shows none.
2. Sign in on the web; the existing browser data uploads on the first sync.
3. Check `/api/status` while signed in: Litestream's last upload within a minute, a daily copy from the startup catch-up, and objects in both buckets.
4. External uptime monitor on `https://lift.eerolehtinen.fi/api/status`, alerting when it is down or the body lacks `"backupsOk":true`.
5. Release an APK (`v0.2.0`), install it over the current app, sign in, and check that the phone and the web stay in sync both ways. The sign-in's Custom Tab return and the deep link are only testable on a device.

## Exit checks

- Phone and web stay in sync over a few real days.
- Rehearse the "VPS lost" procedure once ([deployment.md](../deployment.md#recovery-procedures)): restore the replica into a scratch volume (or a scratch VPS), start the image on it, and compare row counts with the live database. Record the result and anything the procedure missed in deployment.md.
