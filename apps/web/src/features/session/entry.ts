import {
  type ExerciseType,
  fromKg,
  type SetValues,
  toKg,
  type WeightUnit,
} from "@workout-logger/core";

/** Set input in display units. Weight is kept unrounded; see units and rounding. */
export interface Entry {
  weight: number | null;
  reps: number | null;
  durationS: number | null;
  distanceKm: number | null;
}

export type EntryField = keyof Entry;

export const FIELDS: Record<ExerciseType, readonly EntryField[]> = {
  weight_reps: ["weight", "reps"],
  bodyweight_reps: ["weight", "reps"],
  reps: ["reps"],
  time: ["durationS"],
  distance_time: ["distanceKm", "durationS"],
};

export function entryFromSet(set: SetValues, unit: WeightUnit): Entry {
  return {
    weight: set.weight_kg === null ? null : fromKg(set.weight_kg, unit),
    reps: set.reps,
    durationS: set.duration_s,
    distanceKm: set.distance_m === null ? null : set.distance_m / 1000,
  };
}

/**
 * The stored values, or null if the entry can't be logged yet. Fields the
 * exercise type doesn't use are stored as null.
 */
export function setFromEntry(
  entry: Entry,
  type: ExerciseType,
  unit: WeightUnit,
): SetValues | null {
  const fields = FIELDS[type];
  const reps = entry.reps === null ? null : Math.round(entry.reps);
  const values: SetValues = {
    weight_kg: fields.includes("weight") ? toKg(entry.weight ?? 0, unit) : null,
    reps: fields.includes("reps") ? reps : null,
    duration_s: fields.includes("durationS") ? entry.durationS : null,
    distance_m:
      fields.includes("distanceKm") && entry.distanceKm !== null
        ? entry.distanceKm * 1000
        : null,
  };
  switch (type) {
    case "weight_reps":
      return entry.weight !== null && (reps ?? 0) >= 1 ? values : null;
    case "bodyweight_reps":
    case "reps":
      return (reps ?? 0) >= 1 ? values : null;
    case "time":
      return (entry.durationS ?? 0) > 0 ? values : null;
    case "distance_time":
      return (entry.distanceKm ?? 0) > 0 || (entry.durationS ?? 0) > 0
        ? values
        : null;
  }
}
