# Open questions

Items to decide. Once an item is decided, move the result into the relevant
doc and delete it here.

## Deferred

1. **Charting library.** Try several (e.g. ECharts, uPlot) on real data when building the first graphs. Requirements: multi-series time charts, zoom, a shared crosshair across stacked panels, and multiple y-axes.
2. **Quota numbers** in [accounts.md](accounts.md#quotas). Tune them once there is real usage data from the owner account.

## Needed from you

- **How you use FitNotes routine sections.** In your backup, some sections hold several times more exercises than any logged workout. If sections are workout days in a cycle, they map to `routine_day` and `slot`. If they are pools you pick exercises from, the routine import in [fitnotes-import.md](fitnotes-import.md#routines) needs a different mapping, and the routine model may need checking. Also: which of the two routines is current, and should the other be archived?
- Phone model and Android version, for the rest alarm and Health Connect spikes.

The order of work is in [implementation-plan.md](implementation-plan.md).
