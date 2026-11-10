# Phase 7: history, records, calendar

Working plan for [phase 7](../implementation-plan.md#phase-7-history-records-calendar-m).
Deleted once the phase is done and its decisions are in the design docs.

## Built

- `core`: local dates and weeks (`domain/calendar.ts`, Temporal), history
  series and records (`domain/history.ts`), frequency stats
  (`domain/frequency.ts`), and the queries `exerciseHistory`,
  `sessionsInRange`, and `trainingStats`. The `week_start` setting.
- Exercise history screen (`/exercises/$exerciseId/history`): the graph with
  every metric from [features.md](../features.md#exercise-logging-view), the
  records, and past sessions with markers. The exercise list and the logging
  view link to it; it links to the editor.
- History tab (`/history`): the month calendar with sessions marked by
  routine day, the selected day's sessions, and the frequency stats.
- A chart API independent of the library (`apps/web/src/components/chart`):
  `TimeChart` and `BarChart`, and the theme tokens resolved for canvas.

## Charting spike

Two branches implement `components/chart/index.tsx` with one library each,
from the same base commit:

- `t3/phase-7-charts-echarts`: Apache ECharts.
- `t3/phase-7-charts-uplot`: uPlot.

Compared on the owner's real history (a FitNotes backup converted to a
snapshot, outside the repo), at phone and PC widths, light and dark, and on:
bundle size, zoom and tooltip on touch and mouse, how the stacked panels with
a shared crosshair and the normalized overlay of phase 8 would be built, and
the code needed. The winner is merged and recorded in
[architecture.md](../architecture.md#tech-stack).

## Remaining

- Routine editor polish: duplicate routines and days, slot notes, rest
  overrides.
- Past sessions open read-only, with editing available.
