import type { ExerciseType, SetLogTable } from "../schema/tables.ts";
import { DEFAULT_E1RM_REP_CAP, estimateOneRepMax } from "./e1rm.ts";
import { WEIGHT_EPSILON_KG } from "./units.ts";

/** At most one per set. Rules in docs/features.md#progress-markers. */
export type ProgressMarker = "pr" | "set_record" | "weight_increase";

export type SetValues = Pick<
  SetLogTable,
  "weight_kg" | "reps" | "duration_s" | "distance_m"
>;

export interface MarkerOptions {
  e1rmRepCap?: number;
}

/**
 * Markers for every set of one exercise's performances, oldest first. A
 * performance is the exercise's sets in one session, ordered by position,
 * without deleted sets. Each set is judged against the history before it, so
 * markers show what was achieved at the time.
 */
export function markPerformances(
  type: ExerciseType,
  performances: readonly (readonly SetValues[])[],
  options: MarkerOptions = {},
): (ProgressMarker | null)[][] {
  const cap = options.e1rmRepCap ?? DEFAULT_E1RM_REP_CAP;
  // Best PR score per comparable kind, over all earlier sets.
  const best = new Map<ScoreKind, number>();
  let previous: readonly SetValues[] | undefined;

  return performances.map((sets, index) => {
    const markers = sets.map((set, i) => {
      const score = prScore(type, set, cap);
      const bestBefore = score && best.get(score.kind);
      if (score)
        best.set(score.kind, Math.max(bestBefore ?? score.value, score.value));

      // The first performance would be all PRs.
      if (
        index > 0 &&
        score &&
        bestBefore !== undefined &&
        greater(score.value, bestBefore)
      ) {
        return "pr";
      }
      const reference = previous?.[i];
      if (!reference) return null;
      if (isSetRecord(type, set, reference, cap)) return "set_record";
      if (isWeightType(type) && greater(weight(set), weight(reference))) {
        return "weight_increase";
      }
      return null;
    });
    previous = sets;
    return markers;
  });
}

type ScoreKind = "e1rm" | "reps" | "duration" | "distance";

/**
 * What a PR compares. Kinds aren't comparable with each other: a bodyweight
 * set without added weight competes on reps with other such sets.
 */
function prScore(
  type: ExerciseType,
  set: SetValues,
  cap: number,
): { kind: ScoreKind; value: number } | undefined {
  const score = (kind: ScoreKind, value: number | null | undefined) =>
    value != null && value > 0 ? { kind, value } : undefined;
  switch (type) {
    case "weight_reps":
      return score("e1rm", e1rm(set, cap));
    case "bodyweight_reps":
      return hasAddedWeight(set)
        ? score("e1rm", e1rm(set, cap))
        : score("reps", set.reps);
    case "reps":
      return score("reps", set.reps);
    case "time":
      return score("duration", set.duration_s);
    case "distance_time":
      return score("distance", set.distance_m);
  }
}

function isSetRecord(
  type: ExerciseType,
  set: SetValues,
  reference: SetValues,
  cap: number,
): boolean {
  switch (type) {
    case "reps":
      return greater(set.reps ?? 0, reference.reps ?? 0);
    case "time":
      return greater(set.duration_s ?? 0, reference.duration_s ?? 0);
    case "distance_time":
      return greater(set.distance_m ?? 0, reference.distance_m ?? 0);
    case "bodyweight_reps":
      if (!hasAddedWeight(set) && !hasAddedWeight(reference)) {
        return greater(set.reps ?? 0, reference.reps ?? 0);
      }
      return isWeightSetRecord(set, reference, cap);
    case "weight_reps":
      return isWeightSetRecord(set, reference, cap);
  }
}

function isWeightSetRecord(set: SetValues, reference: SetValues, cap: number) {
  const e1 = e1rm(set, cap);
  const e1Reference = e1rm(reference, cap);
  if (e1 !== undefined && e1Reference !== undefined)
    return greater(e1, e1Reference);
  // Above the cap the estimate isn't trusted: require at least as much weight
  // and reps, and strictly more of one.
  const w = weight(set);
  const wRef = weight(reference);
  const r = set.reps ?? 0;
  const rRef = reference.reps ?? 0;
  return (
    !greater(wRef, w) &&
    !greater(rRef, r) &&
    (greater(w, wRef) || greater(r, rRef))
  );
}

function isWeightType(type: ExerciseType) {
  return type === "weight_reps" || type === "bodyweight_reps";
}

function weight(set: SetValues) {
  return set.weight_kg ?? 0;
}

function hasAddedWeight(set: SetValues) {
  return greater(weight(set), 0);
}

function e1rm(set: SetValues, cap: number) {
  return estimateOneRepMax(weight(set), set.reps ?? 0, cap);
}

/** Greater by more than the epsilon; ties get no marker. */
function greater(a: number, b: number) {
  return a > b + WEIGHT_EPSILON_KG;
}
