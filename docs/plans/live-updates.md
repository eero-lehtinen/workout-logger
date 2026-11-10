# Plan: Android live updates

Ship web changes to the Android app without an APK release. Almost all code
is web code, and every APK release is a manual install on each phone. After a
domain schema change, a phone on the old app also stops syncing until it
updates ([migrations.md](../migrations.md#mixed-versions-across-devices)).
With live updates, that pause lasts until the phone next opens the app.

## Decision

The app downloads newer copies of the web build (`dist`) and serves them
instead of the bundled one, from the same origin, `https://localhost`.

Rejected: pointing the WebView at the live site with Capacitor's `server.url`.
The database lives in the origin's storage, so loading
`lift.eerolehtinen.fi` starts with an empty database (invariant 11 in
AGENTS.md). It would also lose the bundled copy for offline starts, and
Capacitor documents `server.url` for development only.

## Design

- **Plugin.** A Capacitor 8 live-update plugin that downloads a bundle from our own URL, switches to it, and rolls back a bundle that fails to start. Candidates: [@capawesome/capacitor-live-update](https://capawesome.io/plugins/live-update/) (any download URL, code signing for self-hosted bundles) and [@capgo/capacitor-updater](https://capgo.app/docs/plugins/updater/self-hosted/manual-update/) in manual mode. Check current docs and licenses, then pick one and record why in [architecture.md](../architecture.md).
- **Bundle.** CI zips the web build with a manifest: the web version (the commit), and the oldest native shell version it works with (`minNative`). The server image includes the zip.
- **Endpoints.** Next to the existing Android update endpoints ([deployment.md](../deployment.md#android-releases)): the latest bundle's version and `minNative`, and the zip. No GitHub token needed; the server serves its own build.
- **App flow.** On start, as the APK check does:
  1. Ask for the latest bundle. Skip it if it's the running one, or if `minNative` is above this shell's version; then the APK update prompt covers it.
  2. Download it in the background and apply it on the next start, never in the middle of a session.
  3. After the app has opened its database and rendered, mark the bundle good. A bundle that isn't marked good is rolled back to the last good one, then to the bundled copy.
- **Native version.** A native change (a new plugin, a changed `RestTimer`) raises the shell's native version and needs an APK, as now. `minNative` keeps a new bundle off an old shell that lacks what it calls.
- **Integrity.** The bundle comes over HTTPS from our server. Use the plugin's code signing if it supports a self-held key.
- **Browsers.** Unchanged: the PWA updates through its service worker.

## Order

1. The first release with the plugin is an APK. Shipping it together with schema version 2 (routine descriptions) needs one APK for both.
2. From then on, a push to `main` reaches the phone within one or two app starts.

## Tests

- Unit tests for the update decision: newer, same, too new for this shell, rollback state.
- On the phone: a bundle update applies on the next start; a broken bundle rolls back; a bundle that needs a newer shell shows the APK prompt instead; the database survives all three.

## Docs to update

- [deployment.md](../deployment.md#android-releases): the bundle, its endpoints, and when an APK is still needed.
- [architecture.md](../architecture.md): the plugin, the bundle switch, and that it keeps the origin.
- [migrations.md](../migrations.md#mixed-versions-across-devices): the old app updates itself on its next start.
