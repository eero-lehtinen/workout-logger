# Phase 6 rollout

The code for phase 6 is done: the server (GitHub sign-in, sync, migrations,
DB copies, status), the client sync loop and Settings UI, the Android sign-in,
and the compose file with Litestream. What's left needs the owner's accounts
and the VPS. Delete this file once every item is done and the phase is marked
`[done]` in [implementation-plan.md](../implementation-plan.md).

## Before merging to `main`

Done on 2026-11-10: the production GitHub OAuth app; the R2 buckets
`wl-litestream` and `wl-backups` (Western Europe) with their lifecycle rules
and one Object Read & Write token each, checked to be refused on the other
bucket; and every variable the compose file requires (`${VAR:?}`) in the
Dokploy environment of the `workout-logger` compose service.

`configs` with `content:` needs Compose 2.23.1+. Dokploy (v0.31.0) runs
Compose from its own image, which installs Docker 28.5.2 and the newest
Compose plugin with `get.docker.com`, and it passes the `configs` section
through (it parses the file with `yaml`, adds its labels and network, and
writes it back). If the first deploy still fails on `configs`, mount
`litestream.yml` with Dokploy's file mounts and update the compose file and
deployment.md.

Rehearsed locally on 2026-11-10 with the production image, `deploy/compose.yaml`
as is, and SeaweedFS's S3 server in place of R2 (Docker Compose 5.7):

- a fresh stack with an empty replica: no restore, migrations, the daily copy at startup, Litestream uploading, and `/api/status` reporting both layers through the control socket with `backupsOk: true`;
- "VPS lost" (data volume deleted): `litestream-init` restored all changes, the owner, and the sessions; the app started a new epoch before serving; Litestream kept replicating afterwards;
- a plain restart: same epoch, nothing lost;
- the daily copy restored into an empty volume with the marker: a new epoch, and Litestream replicated the restored database over the old replica without errors; a later "VPS lost" restored that newer state. The copy lacked the owner and the sessions created after it, which the recovery table now says.

What this can't show: Dokploy's handling of the compose file, R2 itself, and GitHub sign-in.

## After the first deploy

1. In the `app` container's terminal: `node server/dist/cli.js create-owner --email <email>`, where the email is the GitHub account's public profile email, or its primary email if the profile shows none.
2. Settings → Export snapshot on every device that has data, then sign in on the web; the existing browser data uploads on the first sync. The first sync is the riskiest moment for existing data.
3. Check `/api/status` while signed in: Litestream's last upload within a minute, a daily copy from the startup catch-up, and objects in both buckets.
4. External uptime monitor on `https://lift.eerolehtinen.fi/api/status`, alerting when it is down or the body lacks `"backupsOk":true`.
5. Release an APK (`v0.2.0`), install it over the current app, sign in, and check that the phone and the web stay in sync both ways. The sign-in's Custom Tab return and the deep link are only testable on a device.

## Exit checks

- Phone and web stay in sync over a few real days.
- Before inviting anyone, rehearse the "VPS lost" procedure once ([deployment.md](../deployment.md#recovery-procedures)): restore the replica into a scratch volume (or a scratch VPS), start the image on it, check that it started a new epoch, and compare row counts with the live database. Then restore the newest daily copy the same way. Record the results and anything the procedures missed in deployment.md.
