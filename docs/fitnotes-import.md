# FitNotes import

## Source

FitNotes' "Android DB" backup produces a `.fitnotes` file, which is a plain
SQLite database. That file is the import source.

The CSV export is not used: it is lossy and lacks routines.

The FitNotes schema is undocumented. Mapping is done against a real backup.

Step 1: open a backup and record the actual tables and columns here.

## Expected mapping (to verify)

| FitNotes concept | Ours | Notes |
| --- | --- | --- |
| Category (Chest, Back, ...) | Muscle group hint | FitNotes has one category per exercise. Muscle targets need manual or seed-assisted mapping. |
| Exercise | `exercise` | Match to built-in exercises by name where possible. Otherwise create custom exercises. Keep a FitNotes-id-to-our-id map for re-imports. |
| Training log row (exercise, date, weight, reps, ...) | `set_log` | Group rows by date into a `session`, and by exercise within a session into a `session_exercise`. Keep the original row order. |
| Workout time / workout duration records, if present | `session.started_at/ended_at` | Otherwise derive the times from the log timestamps, if any exist; else use date-only with a NULL duration. |
| Routines, routine sections, routine exercises | `routine`, `routine_day`, `slot` | Alternatives don't exist in FitNotes. |
| Comments | `notes` fields | |
| Body weight | Later (P2) | |
| Personal record flags | Ignored | Recomputed. |

## Process

1. **Exploration.** We open the backup together, list the schema, and write the confirmed mapping above.
2. **Exercise mapping file.** A JSON file mapping FitNotes exercise names to our exercises. It is generated with best guesses and then reviewed by hand. This is the step that needs human judgment.
3. **Importer in `packages/core`.** It reads the `.fitnotes` file with SQLite and writes through the normal core write path, so the imported rows get HLCs and sync like any other data. The importer runs:
   - in the app, as a file picker under Settings → Import;
   - from the CLI, as `wl import fitnotes <file>`.
4. **Idempotency.** Imported rows get deterministic ids derived from the FitNotes row ids (UUIDv5). Re-importing a newer backup then updates rows instead of duplicating them. This matters during the transition period while FitNotes is still in use.
