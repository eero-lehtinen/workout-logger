# Open questions

Items to decide. Each one has a proposed default. Once an item is decided,
move the result into the relevant doc and delete it here.

## Product

1. **Previous performance with substitutions.** If the slot's default was Barbell Row and last time you did Dumbbell Row, what does the view show? Proposed: the last performance of the exercise selected now, plus a small "last time in this slot: Dumbbell Row ..." line.
2. **Rest timer default.** Proposed: global 2:00, overridable per exercise and per slot. Should warm-up sets start a shorter timer, or none?
3. **Sessions per day.** One session per day as in FitNotes, or allow several? Proposed: several allowed. Sessions are time-based, not date-based.
4. **Units.** kg only at first. Coworkers might want lb, which is a display-only change.
5. **Body weight in e1RM for bodyweight exercises.** Should pull-up e1RM use body weight + added weight once body weight data exists? Proposed: yes, P2.

## Technical

6. **Sync implementation.** The custom protocol in [sync.md](sync.md), or a half-day Evolu spike first? Proposed: custom. Evolu's mnemonic identity and encrypted relay don't fit the login, quota, CLI, and restore requirements well.
7. **Android local DB.** WASM SQLite in the WebView (one code path) vs the native SQLite plugin. Proposed: WASM in both behind a small driver interface. Verify it during the first spike.
8. **Hosting.** Proposed: Cloudflare (Workers + D1 + R2) on the free plan. Workers Paid ($5/month) if quotas get tight. The Hono server keeps a move to the VPS possible.
9. **Login method.** Email + password with owner-made reset links (no email infrastructure), or Google OAuth from the start? Proposed: email + password. Google OAuth as P2.
10. **Privacy toward coworkers.** Is "the owner can technically read your data" acceptable, or is end-to-end encryption required? Proposed: acceptable, stated openly.
11. **UI framework.** React unless you prefer something else.
12. **Charts.** uPlot vs ECharts. The measurements page needs multiple y-axes or stacked panels with a shared crosshair; decide when building it.

## Needed from you

- A recent `.fitnotes` backup file. It goes in a git-ignored `data/` directory and is never committed.
- Your current routine(s), to validate the routine model.
- Phone model and Android version, for the rest alarm and Health Connect spikes.

## Suggested first milestones

1. **Spikes**
   - Capacitor app on the phone: rest alarm over music, silent mode, locked screen.
   - Health Connect weight read.
   - SQLite WASM + OPFS in the browser and in the Android WebView.
   - Read the `.fitnotes` schema.
2. **Core + local DB:** schema, migrations, HLC/outbox write path, FitNotes import, exercise seed.
3. **Logging UI:** routine pick → session view → exercise view → rest timer.
4. **Server:** auth, invites, sync endpoints, quotas, daily snapshot. Sync is P0, so this lands together with the logging UI.
5. **Routine editor, history graph, records.** This is when FitNotes can be replaced.
6. **CLI, measurements page, analytics, admin page.**
