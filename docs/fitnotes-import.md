# FitNotes import

The details get settled when we import a real backup. These are the rules
that are fixed up front.

## Source

FitNotes' "Android DB" backup produces a `.fitnotes` file, which is a plain
SQLite database. That file is the import source.

The CSV export is not used: it is lossy and lacks routines.

The FitNotes schema is undocumented. Step 1 is to open a real backup and record
the actual tables and columns here.

## Principles

- **Nothing is silently dropped.** Every FitNotes field ends up in one of three places:
  1. a matching field;
  2. the nearest notes field, as text the user can edit later;
  3. the import report.
- **Import report.** Shown after import, and kept as a session-less note. It lists counts per entity, what went into notes, and what was skipped and why.
- **Idempotent.** Ids are UUIDv5 of the FitNotes table and row id, written by the `fitnotes` pseudo-node ([sync.md](sync.md#deterministic-writes)).

## Expected mapping (verify against a real backup)

| FitNotes concept | Ours | Notes |
| --- | --- | --- |
| Category (Chest, Back, ...) | Muscle group hint | FitNotes has one category per exercise. Muscle targets come from the exercise mapping file below. |
| Exercise | `exercise` | Matched to built-in exercises by name where possible; otherwise created as custom exercises. Exercise types without a counterpart (e.g. weight + distance) use the closest type, with the extra value in notes. |
| Training log row | `set_log` | Grouped by date into a `session` and by exercise into a `session_exercise`, keeping the row order. Weights logged in lb are converted to kg. |
| Per-set comment | `session_exercise.notes` | Appended as `Set 2: <comment>`. We have no per-set notes. |
| Workout time records, if present | `session.started_at` / `ended_at` | |
| Date-only workouts | `session` | `started_at` = local noon of the date, `ended_at = started_at`, `end_reason = 'unknown'`. Excluded from duration stats. |
| Two workouts on one date | One `session` | FitNotes groups by date; we keep that. |
| Routines, sections, routine exercises | `routine`, `routine_day`, `slot` | Predefined sets, supersets/circuits, and "mark complete" flags have no counterpart. They are listed in the routine's note. |
| Workout comments | `session.notes` | |
| Body Tracker: body weight, body fat, custom measurements | `metric`, `measurement` with `source = 'import'` | Body weight maps to the built-in metric; the others become custom metrics with their units. Goals are skipped. |
| Goals, personal record flags | Skipped | Records are recomputed. |

Imported sessions have no routine day, so per-day stats and "next day" start
empty after cutover. Optionally, infer the day by matching a session's
exercises against the routine days.

## Exercise mapping file

A JSON file maps FitNotes exercise names to our exercises, or to "create
custom". New custom exercises also get muscle targets. The file is generated
with best guesses and reviewed by hand; this is the step that needs human
judgment. It is reused on re-import.

## Re-import

FitNotes stays the source of truth until cutover. A re-import:

- updates rows still owned by the import, i.e. last written by the `fitnotes` node, when their data changed. They get a fresh HLC (wall = import time);
- skips rows edited in our app since import, i.e. last written by another node. User edits win;
- soft-deletes import-owned rows that are missing from the new backup.

After cutover, FitNotes isn't used and re-import isn't needed.

## Running it

The importer lives in `packages/core`. It reads the file with SQLite and
writes through the normal core write path, so the result syncs like any other
data. It runs:

- in the app: Settings → Import → FitNotes;
- from the CLI: `wl import fitnotes <file>`, with a write-scoped key.

Importing years of history exceeds the daily change quota for `user` accounts.
The owner grants a temporary import exemption ([accounts.md](accounts.md#quotas)).
