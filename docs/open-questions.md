# Open questions

Items to decide. Once an item is decided, move the result into the relevant
doc and delete it here.

## Deferred

1. **Charting library.** Try several (e.g. ECharts, uPlot) on real data when building the first graphs. Requirements: multi-series time charts, zoom, a shared crosshair across stacked panels, and multiple y-axes.
2. **Quota numbers** in [accounts.md](accounts.md#quotas). Tune them once there is real usage data from the owner account.

## Needed from you

- A recent `.fitnotes` backup file. It goes in a git-ignored `data/` directory and is never committed.
- Your current routine(s), to validate the routine model.
- Phone model and Android version, for the rest alarm and Health Connect spikes.

## Suggested first milestones

1. **Spikes**
   - Capacitor app with the `RestTimer` plugin on the phone: over music, silent mode, DND, locked screen, app swiped away.
   - Health Connect weight read.
   - SQLite WASM + OPFS in the browser and in the Android WebView.
   - Read the `.fitnotes` schema.
2. **Core + local DB:** schema, migrations, HLC/outbox write path, FitNotes import, exercise seed.
3. **Logging UI:** routine pick → session view → exercise view → rest timer.
4. **Server:** auth, invites, sync endpoints, quotas, Litestream, daily DB copy, deployment on Dokploy. Sync is P0, so this lands together with the logging UI.
5. **Routine editor, history graph, records, calendar.** This is when FitNotes can be replaced.
6. **CLI, measurements page, analytics, admin page.**
