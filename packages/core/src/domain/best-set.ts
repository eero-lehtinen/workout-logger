import type { ExerciseType } from "../schema/tables.ts";
import { DEFAULT_E1RM_REP_CAP, estimateOneRepMax } from "./e1rm.ts";
import { type HeadlineKind, headlineKinds } from "./history.ts";
import type { SetValues } from "./markers.ts";
import { greater, hasWeight, sameWeight } from "./weight-compare.ts";

/**
 * An exercise's sets with the same rep count, reduced to what its best set
 * needs. Lets the exercise list get every exercise's best in one grouped
 * scan instead of loading all sets.
 */
export interface RepCountGroup {
  reps: number | null;
  /** Null when no set has a weight. */
  maxWeightKg: number | null;
  maxDurationS: number | null;
  maxDistanceM: number | null;
}

export interface BestSet {
  /** The exercise type's first headline record that has a value. */
  kind: HeadlineKind;
  /** kg, reps, s, or m. */
  value: number;
  /** The set's weight and reps for `e1rm` and `weight`; null otherwise. */
  set: SetValues | null;
}

/**
 * What the records headline shows first, from per-rep-count maxima. For
 * `weight`, the most reps at the heaviest weight. Unlike the records, which
 * keep the earliest set, an e1RM tie goes to the set with fewer reps: the
 * groups don't say which came first.
 */
export function bestSet(
  type: ExerciseType,
  groups: readonly RepCountGroup[],
  options: { e1rmRepCap?: number } = {},
): BestSet | null {
  const cap = options.e1rmRepCap ?? DEFAULT_E1RM_REP_CAP;
  const byReps = [...groups].sort((a, b) => (a.reps ?? 0) - (b.reps ?? 0));
  for (const kind of headlineKinds(type)) {
    const best = bestOfKind(kind, byReps, cap);
    if (best) return best;
  }
  return null;
}

function bestOfKind(
  kind: HeadlineKind,
  byReps: readonly RepCountGroup[],
  cap: number,
): BestSet | null {
  let best: BestSet | null = null;
  for (const g of byReps) {
    const reps = g.reps ?? 0;
    const set =
      g.maxWeightKg !== null && hasWeight({ weight_kg: g.maxWeightKg })
        ? {
            weight_kg: g.maxWeightKg,
            reps,
            duration_s: null,
            distance_m: null,
          }
        : null;
    let value: number | undefined;
    switch (kind) {
      case "e1rm":
        value = set ? estimateOneRepMax(set.weight_kg, reps, cap) : undefined;
        break;
      case "weight":
        // Groups go by rep count, so a later one at the same weight has more.
        if (set && best && sameWeight(set.weight_kg, best.value)) {
          best = { kind, value: best.value, set };
          continue;
        }
        value = set?.weight_kg;
        break;
      // `bodyweight_reps` gets here only when no set had added weight.
      case "reps":
        value = reps;
        break;
      case "duration":
        value = g.maxDurationS ?? undefined;
        break;
      case "distance":
        value = g.maxDistanceM ?? undefined;
        break;
    }
    if (value === undefined || value <= 0) continue;
    if (!best || greater(value, best.value)) {
      best = {
        kind,
        value,
        set: kind === "e1rm" || kind === "weight" ? set : null,
      };
    }
  }
  return best;
}
