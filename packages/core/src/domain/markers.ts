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
 * What a marker compared. `weight_and_reps` is the set record above the
 * e1RM cap: at least as much weight and reps, and strictly more of one.
 */
export type MarkerMeasure =
  | "e1rm"
  | "reps"
  | "duration"
  | "distance"
  | "weight"
  | "weight_and_reps";

/** Why a set got its marker. */
export interface MarkerBasis {
  marker: ProgressMarker;
  measure: MarkerMeasure;
  /** This set's value of the measure (kg, reps, s, m); null for weight_and_reps. */
  value: number | null;
  /** The value it beat; null for weight_and_reps. */
  compared: number | null;
  /**
   * The set it was compared with, as indexes into the performances: the
   * previous best for a PR, the reference set otherwise.
   */
  against: { performance: number; set: number };
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
  return explainPerformances(type, performances, options).map((sets) =>
    sets.map((basis) => basis?.marker ?? null),
  );
}

/** Like `markPerformances`, with what each marker was based on. */
export function explainPerformances(
  type: ExerciseType,
  performances: readonly (readonly SetValues[])[],
  options: MarkerOptions = {},
): (MarkerBasis | null)[][] {
  const cap = options.e1rmRepCap ?? DEFAULT_E1RM_REP_CAP;
  // Best PR score per comparable kind over all earlier sets, and where it was.
  const best = new Map<
    ScoreKind,
    { value: number; at: MarkerBasis["against"] }
  >();
  let previous: readonly SetValues[] | undefined;

  return performances.map((sets, index) => {
    const bases = sets.map((set, i): MarkerBasis | null => {
      const score = prScore(type, set, cap);
      const bestBefore = score && best.get(score.kind);
      if (score && (!bestBefore || score.value > bestBefore.value)) {
        best.set(score.kind, {
          value: score.value,
          at: { performance: index, set: i },
        });
      }

      // The first performance would be all PRs.
      if (index > 0 && score && bestBefore) {
        if (greater(score.value, bestBefore.value)) {
          return {
            marker: "pr",
            measure: score.kind,
            value: score.value,
            compared: bestBefore.value,
            against: bestBefore.at,
          };
        }
      }
      const reference = previous?.[i];
      if (!reference) return null;
      const against = { performance: index - 1, set: i };
      const record = setRecord(type, set, reference, cap);
      if (record) return { marker: "set_record", ...record, against };
      if (isWeightType(type) && greater(weight(set), weight(reference))) {
        return {
          marker: "weight_increase",
          measure: "weight",
          value: weight(set),
          compared: weight(reference),
          against,
        };
      }
      return null;
    });
    previous = sets;
    return bases;
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

type Comparison = Pick<MarkerBasis, "measure" | "value" | "compared">;

/** The set record comparison that holds, if any. */
function setRecord(
  type: ExerciseType,
  set: SetValues,
  reference: SetValues,
  cap: number,
): Comparison | null {
  switch (type) {
    case "reps":
      return beats("reps", set.reps ?? 0, reference.reps ?? 0);
    case "time":
      return beats("duration", set.duration_s ?? 0, reference.duration_s ?? 0);
    case "distance_time":
      return beats("distance", set.distance_m ?? 0, reference.distance_m ?? 0);
    case "bodyweight_reps":
      if (!hasAddedWeight(set) && !hasAddedWeight(reference)) {
        return beats("reps", set.reps ?? 0, reference.reps ?? 0);
      }
      return weightSetRecord(set, reference, cap);
    case "weight_reps":
      return weightSetRecord(set, reference, cap);
  }
}

function beats(
  measure: MarkerMeasure,
  value: number,
  compared: number,
): Comparison | null {
  return greater(value, compared) ? { measure, value, compared } : null;
}

function weightSetRecord(
  set: SetValues,
  reference: SetValues,
  cap: number,
): Comparison | null {
  const e1 = e1rm(set, cap);
  const e1Reference = e1rm(reference, cap);
  if (e1 !== undefined && e1Reference !== undefined) {
    return beats("e1rm", e1, e1Reference);
  }
  // Above the cap the estimate isn't trusted: require at least as much weight
  // and reps, and strictly more of one.
  const w = weight(set);
  const wRef = weight(reference);
  const r = set.reps ?? 0;
  const rRef = reference.reps ?? 0;
  const dominates =
    !greater(wRef, w) &&
    !greater(rRef, r) &&
    (greater(w, wRef) || greater(r, rRef));
  return dominates
    ? { measure: "weight_and_reps", value: null, compared: null }
    : null;
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
