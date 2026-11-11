# FitNotes import

The owner's FitNotes history comes over once, at the cutover. A private
script outside this repo (`workout-logger-fitnotes`, next to this checkout)
converts the backup into a [snapshot](backups.md#snapshot-format) with this
repo's `core` and `exercises` packages. The owner imports it with Settings →
Import snapshot. Neither the app nor the CLI has a FitNotes import.

This document is the reference for that conversion: the FitNotes schema and
the general mapping rules, which also say how imported data looks in the app.
Choices specific to the owner's data are in the private repo's README.

If another user ever needs an import, it should need no hand-written
mapping. Built-ins are matched by name, everything else becomes a custom
exercise with its FitNotes name and a muscle guessed from the category, and
the user cleans up in the app (rename, edit muscles, a merge action that
doesn't exist yet).

## Source

FitNotes' "Android DB" backup produces a `.fitnotes` file, which is a plain
SQLite database. That file is the import source.

The CSV export is not used: it is lossy and lacks routines.

The FitNotes schema is undocumented. The schema below was read from a real
backup with `PRAGMA user_version = 22`. The conversion refuses a backup with
a different version.

## Principles

- **Nothing is silently dropped.** Every FitNotes field ends up in one of three places:
  1. a matching field;
  2. the nearest notes field, as text the user can edit later;
  3. the report: listed for the user instead of imported.

  Exceptions are values that FitNotes derives or that only hold FitNotes UI state. They are listed under [Skipped](#skipped).
- **Stable ids.** Ids are UUIDv5 of a FitNotes natural key (see [Ids](#ids)), written by the `fitnotes` pseudo-node ([sync.md](sync.md#deterministic-writes)), so converting a newer backup gives the same rows the same ids.
- **No guessing on unverified paths.** Some features have no rows in the backup the mapping was verified against (see [Unverified](#unverified)). Until a synthetic backup confirms their encoding, rows that need them aren't imported.

## Schema

Every table has an `_id INTEGER PRIMARY KEY AUTOINCREMENT`. AUTOINCREMENT means
deleted ids are never reused, so `_id` is stable across backups and usable as
a re-import key. There are no foreign keys, indexes, or triggers; the
importer checks every reference itself.

Dates are `TEXT` in `YYYY-MM-DD`, the local calendar date. Declared types are
loose: `metric_weight INTEGER` holds REAL values, which SQLite stores as
integers when they are whole.

### Tables

| Table | Holds | Imported as |
| --- | --- | --- |
| `exercise` | The exercise catalog, including FitNotes' default exercises. | `exercise` |
| `Category` | One category per exercise (Chest, Back, ...), with a colour. Users can add categories. | Muscle guess |
| `training_log` | One row per set. | `session`, `session_exercise`, `set_log` |
| `WorkoutTime` | Workout timer start and end, at most one per date. | `session.started_at`, `ended_at` |
| `Comment` | Comments attached to other rows, e.g. a set. | `session_exercise.notes` or `session.notes` |
| `WorkoutComment` | One comment per date. | `session.notes` |
| `Routine` | Routine name and notes. | `routine` |
| `RoutineSection` | Named sections of a routine. | `routine_day` |
| `RoutineSectionExercise` | Exercises of a section. | `slot` |
| `RoutineSectionExerciseSet` | Predefined sets of a routine exercise. | `slot.note` |
| `WorkoutGroup`, `WorkoutGroupExercise` | Supersets/circuits on a date. | `session.notes` |
| `Measurement` | Body tracker measurement definitions. | `metric` |
| `MeasurementUnit` | Units for measurements. | `metric.unit` |
| `MeasurementRecord` | Body tracker values. | `measurement` |
| `BodyWeight` | Older body weight and body fat table. | `measurement` |
| `Goal` | Exercise goals. | Report |
| `ExerciseGraphFavourite`, `RepMaxGridFavourite` | Saved graph views. | Skipped |
| `Barbell`, `Plate` | Plate calculator configuration. | Skipped |
| `settings` | App settings, one row. | Report |
| `android_metadata`, `sqlite_sequence` | Android and SQLite bookkeeping. | Ignored |

### `exercise`

| Column | Meaning |
| --- | --- |
| `name` | Unique in practice. |
| `category_id` | → `Category._id`. |
| `exercise_type_id` | 0 = weight and reps; 1 = distance and time (FitNotes' default cardio exercises); 3 = time (Plank, Side Plank). Other values: [unverified](#unverified). |
| `notes` | Free text, `NULL` or empty when unused. |
| `weight_increment` | Per-exercise override of the +/- step. `NULL` = global default. Unit: [unverified](#unverified). |
| `default_rest_time` | Per-exercise rest timer override, presumably seconds. `NULL` = global default. |
| `weight_unit_id` | 0 = app default. Other values: [unverified](#unverified). |
| `default_graph_id`, `is_favourite` | UI state. |

FitNotes seeds a catalog of default exercises, and many of them typically
have no sets and no routine slot.

FitNotes has no bodyweight exercise type. Pull-ups and similar are type 0
with `metric_weight = 0`, or the added weight when there is one.

### `training_log`

| Column | Meaning |
| --- | --- |
| `exercise_id` | → `exercise._id`. |
| `date` | Local date. No time of day. |
| `metric_weight` | Weight in kg, whatever unit it was entered in. 0 = no weight. |
| `reps` | ≥ 1 for weight-and-reps sets. |
| `unit` | Unit the weight was entered in, as a `MeasurementUnit._id`: 0 = app default, 2 = kg (written explicitly by older app versions), presumably 3 = lb. Does not affect `metric_weight`. |
| `distance` | INTEGER. Used by distance exercise types. Unit: [unverified](#unverified). |
| `duration_seconds` | Used by time exercise types. |
| `routine_section_exercise_set_id` | → `RoutineSectionExerciseSet._id` when the set was prefilled from a predefined set; 0 otherwise. |
| `is_personal_record`, `is_personal_record_first` | Cached PR flags. |
| `is_complete` | The "mark sets complete" checkbox. Only meaningful with that setting on. |
| `timer_auto_start`, `is_pending_update` | Rest timer and UI state. |

`_id` order is the entry order. A set entered later for an earlier date
breaks the global date order, so sort by `(date, _id)`, not `_id` alone.

Exercises alternate within a date: sets of A, then B, then A again. FitNotes
still shows each exercise once per day, with all its sets.

Example (synthetic): 100 kg entered with the app set to kg is
`metric_weight = 100`, `unit = 0`. 225 lb entered in lb is presumably
`metric_weight = 102.0582`, `unit = 3`.

### `WorkoutTime`

| Column | Meaning |
| --- | --- |
| `workout_date` | Local date. Unique in practice: FitNotes keeps one timer per date. |
| `start_date_time`, `end_date_time` | ISO 8601 local time with UTC offset and 0–3 fraction digits, e.g. `2000-01-15T18:02:11.483+02:00` (synthetic). |

- The local date of the start always equals `workout_date`. The end can fall on the next day.
- Durations include forgotten timers (many hours) and accidental near-zero ones.
- Dates with sets but no `WorkoutTime` exist: from before the timer feature was used, and where it wasn't started.

### Routines

| Table | Columns |
| --- | --- |
| `Routine` | `name`, `notes`. No sort column. |
| `RoutineSection` | `routine_id`, `name`, `sort_order`. `sort_order` may start at 0 or 1. |
| `RoutineSectionExercise` | `routine_section_id`, `exercise_id`, `sort_order`, `populate_sets_type` (0 = no predefined sets; other values: [unverified](#unverified)). The same exercise can appear in several sections. |
| `RoutineSectionExerciseSet` | `routine_section_exercise_id`, `metric_weight`, `reps`, `distance`, `duration_seconds`, `unit`, `sort_order`. |

Sections may be empty. Nothing in `training_log` links a set to a routine
section unless it was prefilled from a predefined set.

### Comments and groups

| Table | Columns |
| --- | --- |
| `Comment` | `date`, `owner_type_id`, `owner_id`, `comment`. A polymorphic owner, e.g. a `training_log` row. Owner type codes: [unverified](#unverified). |
| `WorkoutComment` | `date`, `comment`. |
| `WorkoutGroup` | `name`, `date`, `colour`, `routine_section_id` (nullable), `auto_jump_enabled`, `rest_timer_auto_start_enabled`. |
| `WorkoutGroupExercise` | `exercise_id`, `date`, `routine_section_id`, `workout_group_id`. |

### Body tracker

| Table | Columns |
| --- | --- |
| `Measurement` | `name`, `unit_id` → `MeasurementUnit._id`, `goal_type`, `goal_value`, `custom` (0 = FitNotes default), `enabled`, `sort_order`. FitNotes ships 15 defaults: Bodyweight, Body Fat, and circumferences. |
| `MeasurementUnit` | `type` (0 = none, 1 = weight, 2 = length, 3 = percent), `long_name`, `short_name`. Defaults: 1 = none, 2 = kg, 3 = lb, 4 = cm, 5 = in, 6 = %. |
| `MeasurementRecord` | `measurement_id`, `date`, `time` (separate `TEXT` columns; format [unverified](#unverified)), `value` in the measurement's unit, `comment`. |
| `BodyWeight` | `date`, `body_weight_metric` (kg), `body_fat` (%), `comments`. |

### Other tables

- `Goal`: `type_id`, `exercise_id`, `metric_weight`, `reps`, `distance`, `duration_seconds`, `unit`, `title`, `start_date`, `target_date`, `sort_order`.
- `Barbell`, `Plate`: `weight` with `unit` 0 = kg, 1 = lb. This is a different enum from `training_log.unit`.
- `settings`: about 45 columns, mostly UI toggles. Relevant ones:
  - `metric` (1 = kg);
  - `first_day_of_week` (presumably Java `Calendar` constants, 2 = Monday);
  - `weight_increment` (REAL);
  - `rest_timer_seconds`;
  - `estimated_1rm_max_reps_to_include`.

## Mapping

### Exercises

| FitNotes | Ours | Rule |
| --- | --- | --- |
| `exercise` | `exercise` | Via the [exercise mapping](#exercise-mapping): matched to a built-in exercise or created as a custom exercise, renamed, merged, split by date, or skipped. Only exercises with at least one set or routine slot are imported. The rest are FitNotes catalog defaults. |
| `exercise_type_id` 0 | `weight_reps`, `bodyweight_reps`, or `reps` | The mapping decides. For `bodyweight_reps`, `metric_weight` is the added weight. A `reps` target takes no weight. |
| `exercise_type_id` 1 | `distance_time` | |
| `exercise_type_id` 3 | `time` | |
| `exercise.notes` | `exercise.notes` | Only for custom exercises; for a built-in match, the text goes in the report. |
| `weight_increment` | `weight_increment_kg` | |
| `default_rest_time` | `default_rest_s` | |
| `Category` | Muscle guess | Only for guessing a custom exercise's muscle. Not stored. |

### Sessions and sets

| FitNotes | Ours | Rule |
| --- | --- | --- |
| Distinct `training_log.date` | `session` | One session per date, so two workouts on one date are one session, as in FitNotes. `routine_id` and `day_id` stay null. |
| `WorkoutTime` | `session.started_at`, `ended_at` | `end_reason = 'manual'`. Times are kept as recorded; sessions longer than 5 h or shorter than 5 min (forgotten or accidental timers) are listed. The conversion can instead keep their start and give them no duration, as for a date without a timer. |
| Date without `WorkoutTime` | `session` | `started_at` = local noon of the date, `ended_at = started_at`, `end_reason = 'unknown'`. Excluded from duration stats. |
| (none) | `session.tz` | The import takes an IANA zone, defaulting to the device zone. Local noon uses it. A `WorkoutTime` offset that doesn't match the zone at that instant (travel) is listed in the report; the instant is kept. |
| Distinct `(date, target exercise)` | `session_exercise` | The target is our exercise after the mapping, so merged duplicates logged on one date become one session exercise. Positioned by the first set's `_id`. Alternating sets of A and B merge into one session exercise each. `slot_id` stays null. |
| `training_log` row | `set_log` | `position` by `_id`. Columns by exercise type: `weight_kg = metric_weight` and `reps` for the two rep types; `distance_m` and `duration_s` for `distance_time`; `duration_s` for `time`. |
| (none) | `set_log.logged_at` | Synthetic: spread evenly over `[started_at, ended_at]` in `(date, _id)` order. This keeps the order across alternating exercises. For date-only sessions all sets get `started_at`. Not real set times. |
| `Comment` on a `training_log` row | `session_exercise.notes` | Appended as `Set 2: <comment>`. We have no per-set notes. |
| Other `Comment` | `session.notes` | Prefixed with what it was attached to, when known. |
| `WorkoutComment` | `session.notes` | A comment on a date without sets creates a date-only session holding only the note. |
| `WorkoutGroup` | `session.notes` | `Superset <name>: <exercise names>`. We have no supersets. |

### Routines

| FitNotes | Ours | Rule |
| --- | --- | --- |
| `Routine` | `routine` | `archived = 1`, `position` by `_id`. `Routine.notes` → `routine.description`. |
| `RoutineSection` | `routine_day` | `position` by `(sort_order, _id)`. Empty sections become empty days. |
| `RoutineSectionExercise` | `slot` | `position` by `(sort_order, _id)`. No alternatives. |
| `RoutineSectionExerciseSet` | `slot.note` | As text, e.g. `FitNotes sets: 3 × 8 @ 60 kg`. Slots have no set targets. |

Routines are imported archived. FitNotes sections are often lists of
exercises per body part, picked from by hand each workout, not a cycle of
workout days. As active routines they would drive routine preselection and
"next day" from cycles that never existed. They stay available as a
reference, and the user unarchives one that really was a cycle.

Imported sessions are ad hoc: no routine, no day, no slot.

### Body tracker

| FitNotes | Ours | Rule |
| --- | --- | --- |
| `Measurement` "Bodyweight" | Built-in body weight metric | Values in lb are converted to kg. |
| Other `Measurement` | Custom `metric` | `unit` = `MeasurementUnit.short_name`. Only measurements with at least one value are created. |
| `MeasurementRecord` | `measurement` | `source = 'import'`, `measured_at` from `date` + `time` in the import zone, `comment` → `note`. |
| `BodyWeight` | `measurement` | Body weight to the built-in metric, body fat to a custom `%` metric, `comments` → `note`. |
| `Measurement.goal_*`, `Goal` | Report | We have no goals. |

### Skipped

Not imported and not in the report, because FitNotes derives them or they are
FitNotes UI state:

- `is_personal_record`, `is_personal_record_first`: records are recomputed.
- `is_complete`, `timer_auto_start`, `is_pending_update`.
- `ExerciseGraphFavourite`, `RepMaxGridFavourite`, `default_graph_id`, `is_favourite`.
- `Barbell`, `Plate`, `Category.colour`, `Category.sort_order`.
- `settings`. The user sets units, the week start, and the rest time in the app, so an import never overwrites them.

### Ids

UUIDv5 of these keys:

| Ours | Key |
| --- | --- |
| `exercise` (custom) | `custom:<name>`, the custom exercise's name in the mapping. Duplicates mapped to the same name share one exercise. |
| `exercise_muscle` (custom) | `exercise_muscle:<name>:<muscle key>` |
| `session` | `session:<date>` |
| `session_exercise` | `session_exercise:<date>:<target exercise id>` |
| `set_log` | `training_log:<_id>` |
| `routine`, `routine_day`, `slot` | `Routine:<_id>`, `RoutineSection:<_id>`, `RoutineSectionExercise:<_id>` |
| `metric` (custom) | `Measurement:<_id>`, or `BodyWeight:body_fat` |
| `measurement` | `MeasurementRecord:<_id>`, or `BodyWeight:<_id>:weight` and `BodyWeight:<_id>:fat` |

Exercises matched to a built-in use the built-in's id.

## Unverified

These features have no rows in the backup the mapping was verified against.
Their encoding needs a synthetic backup: enter made-up data for each in
FitNotes on a test device, back up, and inspect.

- Distance and time sets: the `distance` unit and how `unit` applies to it.
- `exercise_type_id` values other than 0, 1, and 3.
- `training_log.unit = 3` meaning lb, and `exercise.weight_unit_id` values.
- `exercise.weight_increment` unit and scale.
- `Comment.owner_type_id` codes.
- `MeasurementRecord.time` format; whether `BodyWeight` and `MeasurementRecord` can hold the same value twice.
- `populate_sets_type` values; `RoutineSectionExerciseSet.unit`.
- `WorkoutGroup` semantics.

The lb case is the exception to "don't guess": `metric_weight` is kg
regardless of `unit`, so an unexpected `unit` value doesn't change the
imported weight.

## Exercise mapping

The owner's mapping is code in the private repo, with the analysis behind
it. It says what each FitNotes exercise becomes, which is the step that needs
human judgment. FitNotes history often has:

- **Inconsistent names.** A custom target sets the name of the new exercise.
- **Duplicates.** Several FitNotes exercises map to the same target.
- **One FitNotes exercise used for different variants over time**, e.g. a pushdown done with a straight bar and later with a rope. Mixed together, records and progress markers compare different movements. A FitNotes exercise maps to a list of targets, each covering sets up to an `until` date (inclusive); the last has no `until` and covers the rest. Routine slots get the last target.
- **History not worth keeping**, e.g. a one-off home exercise. A skip target leaves the exercise, its sets, and its routine slots out.

Unmapped FitNotes exercises fail the conversion; nothing falls back silently.
Finding where to split was done by hand: chart each exercise's best e1RM per
session and look for jumps.

## Importing

The conversion writes its rows into a fresh in-memory store seeded with the
catalog, all with one `fitnotes` HLC at conversion time, and saves the store
as a snapshot. Merging it applies the normal LWW rule
([backups.md](backups.md)), and the rows sync like any other data. Converting
a newer backup gives the same rows the same ids with a newer HLC, so a second
merge overwrites edits made to imported rows in the app, and doesn't remove
rows deleted in FitNotes. So the owner imports once, from a backup taken on
cutover day, and stops using FitNotes.

The conversion checks its output against the backup: per target exercise,
the set count, session count, and best e1RM must match.
