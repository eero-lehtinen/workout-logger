# Plan: Android live updates

The design is in [architecture.md](../architecture.md#live-updates), and the
build, endpoints, and signing in [deployment.md](../deployment.md#live-updates).
Everything is built. This file lists what is left before the phase is done;
delete it then.

## Rollout

1. Add the GitHub Actions secret `LIVE_UPDATE_PRIVATE_KEY`, or the `image` job fails: `gh secret set LIVE_UPDATE_PRIVATE_KEY < ~/Documents/ai-doc/workout-logger/android-release/live-update-private.pem`.
2. Merge to `main`, and check that `https://lift.eerolehtinen.fi/api/android/bundle` answers with the commit and a signature.
3. Tag the next release (above 0.4.0; `MIN_NATIVE` is 0.4.1). It is the first APK with the plugin, and it also brings schema version 2 to phones.
4. From then on, a push to `main` reaches a phone within two starts of the app.

## Device tests

Not run yet; the native branches only run on a phone. With a debug build
(`-PappVersion=0.4.1`, its own app id and database) against a local server
behind an HTTPS tunnel:

- A newer bundle is downloaded on one start and runs on the next. Settings → About shows the web build.
- A bundle that fails to start rolls back within 20 s, is not downloaded again, and the bundle before it runs on the next start.
- A bundle with a higher `minNative` is not downloaded; the APK prompt is what the release app shows instead.
- The sets logged before each case are still there after it.
- A release APK installed over the app starts from its own web build and keeps the database.
