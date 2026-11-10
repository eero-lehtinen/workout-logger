import type { ExerciseType } from "../schema/tables.ts";
import { DEFAULT_E1RM_REP_CAP, estimateOneRepMax } from "./e1rm.ts";
import type { SetValues } from "./markers.ts";
import { WEIGHT_EPSILON_KG } from "./units.ts";

/** One session's sets of an exercise, in set order. */
export interface PerformanceSets {
  sessionId: string;
  startedAt: number;
  tz: string;
  sets: readonly SetValues[];
}

/** What the history graph can plot. Which apply depends on the exercise type. */
export type HistoryMetric =
  | "best_e1rm"
  | "set_e1rm"
  | "top_weight"
  | "volume"
  | "reps_at_weight"
  | "best_reps"
  | "total_reps"
  | "best_duration"
  | "total_duration"
  | "best_distance"
  | "total_distance";

const METRICS: Record<ExerciseType, readonly HistoryMetric[]> = {
  weight_reps: [
    "best_e1rm",
    "set_e1rm",
    "top_weight",
    "volume",
    "reps_at_weight",
  ],
  bodyweight_reps: [
    "best_e1rm",
    "set_e1rm",
    "top_weight",
    "best_reps",
    "reps_at_weight",
  ],
  reps: ["best_reps", "total_reps"],
  time: ["best_duration", "total_duration"],
  distance_time: ["best_distance", "total_distance"],
};

export function historyMetrics(type: ExerciseType): readonly HistoryMetric[] {
  return METRICS[type];
}

export interface HistoryPoint {
  /** The session's start. */
  at: number;
  value: number;
  sessionId: string;
}

export interface HistoryOptions {
  e1rmRepCap?: number;
  /** For `reps_at_weight`. */
  weightKg?: number;
}

/**
 * Points of one metric, oldest first: one per session, or one per set for
 * `set_e1rm`. Sessions without a value for the metric are left out.
 */
export function historySeries(
  type: ExerciseType,
  performances: readonly PerformanceSets[],
  metric: HistoryMetric,
  options: HistoryOptions = {},
): HistoryPoint[] {
  const cap = options.e1rmRepCap ?? DEFAULT_E1RM_REP_CAP;
  const points: HistoryPoint[] = [];
  for (const p of performances) {
    const add = (value: number | undefined) => {
      if (value !== undefined) {
        points.push({ at: p.startedAt, value, sessionId: p.sessionId });
      }
    };
    if (metric === "set_e1rm") {
      for (const set of p.sets) add(setE1rm(set, cap));
    } else {
      add(sessionValue(type, p.sets, metric, cap, options.weightKg));
    }
  }
  return points;
}

function sessionValue(
  type: ExerciseType,
  sets: readonly SetValues[],
  metric: Exclude<HistoryMetric, "set_e1rm">,
  cap: number,
  weightKg: number | undefined,
): number | undefined {
  switch (metric) {
    case "best_e1rm":
      return max(sets.map((s) => setE1rm(s, cap)));
    case "top_weight":
      return max(sets.map((s) => positive(s.weight_kg)));
    case "volume":
      return positive(sum(sets.map((s) => (s.weight_kg ?? 0) * (s.reps ?? 0))));
    case "reps_at_weight":
      if (weightKg === undefined) return undefined;
      return max(
        sets
          .filter((s) => sameWeight(s.weight_kg ?? 0, weightKg))
          .map((s) => positive(s.reps)),
      );
    case "best_reps":
      return max(
        sets
          .filter((s) => type !== "bodyweight_reps" || !hasWeight(s))
          .map((s) => positive(s.reps)),
      );
    case "total_reps":
      return positive(sum(sets.map((s) => s.reps ?? 0)));
    case "best_duration":
      return max(sets.map((s) => positive(s.duration_s)));
    case "total_duration":
      return positive(sum(sets.map((s) => s.duration_s ?? 0)));
    case "best_distance":
      return max(sets.map((s) => positive(s.distance_m)));
    case "total_distance":
      return positive(sum(sets.map((s) => s.distance_m ?? 0)));
  }
}

export interface WeightChoice {
  weightKg: number;
  /** Sessions with at least one set at this weight. */
  sessions: number;
}

/** The weights `reps_at_weight` can show, heaviest first. */
export function loggedWeights(
  performances: readonly PerformanceSets[],
): WeightChoice[] {
  const counts = new Map<string, WeightChoice>();
  for (const p of performances) {
    const seen = new Set<string>();
    for (const set of p.sets) {
      if (!hasWeight(set)) continue;
      const key = weightKey(set.weight_kg ?? 0);
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key) ?? {
        weightKg: set.weight_kg ?? 0,
        sessions: 0,
      };
      entry.sessions++;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.weightKg - a.weightKg);
}

/** Where a record was set. */
export interface RecordAt {
  sessionId: string;
  startedAt: number;
  tz: string;
}

export type HeadlineKind =
  | "e1rm"
  | "weight"
  | "reps"
  | "duration"
  | "distance"
  | "session_volume"
  | "session_reps"
  | "session_duration"
  | "session_distance";

export interface HeadlineRecord {
  kind: HeadlineKind;
  /** kg, reps, s, or m. */
  value: number;
  /** The set that holds it; null for session totals. */
  set: SetValues | null;
  at: RecordAt;
}

export interface RepsRecord {
  reps: number;
  /** The heaviest weight lifted for exactly this many reps. */
  weightKg: number;
  /** Null above the e1RM cap. */
  e1rmKg: number | null;
  /** A set with more reps was at least as heavy. */
  beaten: boolean;
  at: RecordAt;
}

export interface WeightRecord {
  weightKg: number;
  /** The most reps done at this weight. */
  reps: number;
  /** A heavier set had at least as many reps. */
  beaten: boolean;
  at: RecordAt;
}

export interface ExerciseRecords {
  headline: HeadlineRecord[];
  /** Weight types only, by rep count. */
  byReps: RepsRecord[];
  /** Weight types only, heaviest first. */
  byWeight: WeightRecord[];
}

const HEADLINES: Record<ExerciseType, readonly HeadlineKind[]> = {
  weight_reps: ["e1rm", "weight", "session_volume"],
  bodyweight_reps: ["e1rm", "weight", "reps"],
  reps: ["reps", "session_reps"],
  time: ["duration", "session_duration"],
  distance_time: ["distance", "session_distance"],
};

/**
 * The exercise's records over all its performances. The first session to
 * reach a value holds the record; ties don't take it over. For
 * `bodyweight_reps`, sets with added weight compete on weight and e1RM, sets
 * without on reps.
 */
export function exerciseRecords(
  type: ExerciseType,
  performances: readonly PerformanceSets[],
  options: { e1rmRepCap?: number } = {},
): ExerciseRecords {
  const cap = options.e1rmRepCap ?? DEFAULT_E1RM_REP_CAP;
  const best = new Map<HeadlineKind, HeadlineRecord>();
  const offer = (
    kind: HeadlineKind,
    value: number | undefined,
    set: SetValues | null,
    at: RecordAt,
  ) => {
    if (value === undefined || value <= 0) return;
    const current = best.get(kind);
    if (!current || greater(value, current.value)) {
      best.set(kind, { kind, value, set, at });
    }
  };
  const byReps = new Map<number, Omit<RepsRecord, "beaten">>();
  const byWeight = new Map<string, Omit<WeightRecord, "beaten">>();
  const weighted = type === "weight_reps" || type === "bodyweight_reps";

  for (const p of performances) {
    const at = { sessionId: p.sessionId, startedAt: p.startedAt, tz: p.tz };
    for (const set of p.sets) {
      const reps = set.reps ?? 0;
      offer("e1rm", setE1rm(set, cap), set, at);
      if (weighted && hasWeight(set)) {
        const w = set.weight_kg ?? 0;
        offer("weight", w, set, at);
        if (reps > 0) {
          const r = byReps.get(reps);
          if (!r || greater(w, r.weightKg)) {
            byReps.set(reps, {
              reps,
              weightKg: w,
              e1rmKg: estimateOneRepMax(w, reps, cap) ?? null,
              at,
            });
          }
          const key = weightKey(w);
          const byW = byWeight.get(key);
          if (!byW || reps > byW.reps) {
            byWeight.set(key, { weightKg: w, reps, at });
          }
        }
      }
      if (type === "reps" || (type === "bodyweight_reps" && !hasWeight(set))) {
        offer("reps", reps, set, at);
      }
      offer("duration", set.duration_s ?? undefined, set, at);
      offer("distance", set.distance_m ?? undefined, set, at);
    }
    offer(
      "session_volume",
      sum(p.sets.map((s) => (s.weight_kg ?? 0) * (s.reps ?? 0))),
      null,
      at,
    );
    offer("session_reps", sum(p.sets.map((s) => s.reps ?? 0)), null, at);
    offer(
      "session_duration",
      sum(p.sets.map((s) => s.duration_s ?? 0)),
      null,
      at,
    );
    offer(
      "session_distance",
      sum(p.sets.map((s) => s.distance_m ?? 0)),
      null,
      at,
    );
  }

  const reps = [...byReps.values()].sort((a, b) => a.reps - b.reps);
  const weights = [...byWeight.values()].sort(
    (a, b) => b.weightKg - a.weightKg,
  );
  return {
    headline: HEADLINES[type].flatMap((kind) => best.get(kind) ?? []),
    byReps: reps.map((r) => ({
      ...r,
      beaten: reps.some(
        (o) => o.reps > r.reps && !greater(r.weightKg, o.weightKg),
      ),
    })),
    byWeight: weights.map((r) => ({
      ...r,
      beaten: weights.some(
        (o) => greater(o.weightKg, r.weightKg) && o.reps >= r.reps,
      ),
    })),
  };
}

function setE1rm(set: SetValues, cap: number): number | undefined {
  if (!hasWeight(set)) return undefined;
  return estimateOneRepMax(set.weight_kg ?? 0, set.reps ?? 0, cap);
}

function hasWeight(set: SetValues) {
  return (set.weight_kg ?? 0) > WEIGHT_EPSILON_KG;
}

function sameWeight(a: number, b: number) {
  return Math.abs(a - b) <= WEIGHT_EPSILON_KG;
}

/** Groups weights that differ by float noise, e.g. converted from lb. */
function weightKey(kg: number) {
  return kg.toFixed(4);
}

function greater(a: number, b: number) {
  return a > b + WEIGHT_EPSILON_KG;
}

function positive(value: number | null | undefined): number | undefined {
  return value != null && value > 0 ? value : undefined;
}

function max(values: (number | undefined)[]): number | undefined {
  let best: number | undefined;
  for (const v of values) {
    if (v !== undefined && (best === undefined || v > best)) best = v;
  }
  return best;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
