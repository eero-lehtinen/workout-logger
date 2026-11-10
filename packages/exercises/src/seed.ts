import {
  type DeterministicRow,
  deterministicHlc,
  deterministicId,
  positionBetween,
  type Store,
  writeDeterministic,
} from "@workout-logger/core";
import {
  CATALOG_REVISION,
  CATALOG_WALL,
  EXERCISES,
  METRICS,
} from "./catalog.ts";
import { MUSCLES, type MuscleKey } from "./muscles.ts";

export const muscleId = (key: MuscleKey) =>
  deterministicId("builtin", `muscle:${key}`);
export const exerciseId = (key: string) =>
  deterministicId("builtin", `exercise:${key}`);
export const metricId = (key: string) =>
  deterministicId("builtin", `metric:${key}`);
const exerciseMuscleId = (exercise: string, muscle: MuscleKey) =>
  deterministicId("builtin", `exercise_muscle:${exercise}:${muscle}`);

/**
 * Every built-in row at this catalog version, with deterministic ids and HLCs,
 * so every device seeds identical rows.
 *
 * Removing a muscle target from a built-in exercise needs a tombstone row
 * here; dropping the entry alone leaves the old target in place.
 */
export function catalogRows(): DeterministicRow[] {
  const hlc = deterministicHlc(CATALOG_WALL, "seed", CATALOG_REVISION);
  const rows: DeterministicRow[] = [];
  for (const [key, muscle] of Object.entries(MUSCLES)) {
    rows.push({
      table: "muscle",
      id: muscleId(key as MuscleKey),
      hlc,
      data: { name: muscle.name, group_name: muscle.group },
    });
  }
  for (const exercise of EXERCISES) {
    rows.push({
      table: "exercise",
      id: exerciseId(exercise.key),
      hlc,
      data: {
        name: exercise.name,
        type: exercise.type,
        default_rest_s: null,
        weight_increment_kg: null,
        notes: "",
        archived: exercise.archived ? 1 : 0,
        builtin_key: exercise.key,
      },
    });
    for (const [muscle, factor] of Object.entries(exercise.muscles)) {
      rows.push({
        table: "exercise_muscle",
        id: exerciseMuscleId(exercise.key, muscle as MuscleKey),
        hlc,
        data: {
          exercise_id: exerciseId(exercise.key),
          muscle_id: muscleId(muscle as MuscleKey),
          factor,
        },
      });
    }
  }
  let position: string | null = null;
  for (const metric of METRICS) {
    position = positionBetween(position, null);
    rows.push({
      table: "metric",
      id: metricId(metric.key),
      hlc,
      data: {
        name: metric.name,
        unit: metric.unit,
        builtin_key: metric.key,
        position,
        archived: 0,
      },
    });
  }
  return rows;
}

/**
 * Writes the built-in catalog. Safe to run on every start: rows already at
 * this version, and rows the user has edited or deleted, are skipped.
 */
export function seedCatalog(store: Store) {
  return writeDeterministic(store, catalogRows());
}
