import type { ExerciseType } from "../schema/tables.ts";
import {
  earlierDate,
  type IsoDate,
  localDate,
  type WeekStart,
} from "./calendar.ts";
import { DEFAULT_E1RM_REP_CAP, estimateOneRepMax } from "./e1rm.ts";
import { perWeek, type WeekTotal } from "./frequency.ts";
import type { SetValues } from "./markers.ts";
import { greater, hasWeight, sameWeight } from "./weight-compare.ts";

/** One session's sets of an exercise, in set order. */
export interface PerformanceSets {
  sessionId: string;
  startedAt: number;
  tz: string;
  sets: readonly SetValues[];
}

/**
 * What the history graph can plot. Which apply depends on the exercise type.
 * `weekly_sets` is per week (`weeklySets`), `set_e1rm` one series per set
 * number (`setE1rmSeries`), the others one value per session
 * (`historySeries`).
 */
export type HistoryMetric =
  | "best_e1rm"
  | "set_e1rm"
  | "top_weight"
  | "reps_at_weight"
  | "best_reps"
  | "best_duration"
  | "best_distance"
  | "weekly_sets";

export type SessionMetric = Exclude<HistoryMetric, "weekly_sets" | "set_e1rm">;

const METRICS: Record<ExerciseType, readonly HistoryMetric[]> = {
  weight_reps: [
    "best_e1rm",
    "set_e1rm",
    "top_weight",
    "reps_at_weight",
    "weekly_sets",
  ],
  bodyweight_reps: [
    "best_e1rm",
    "set_e1rm",
    "top_weight",
    "best_reps",
    "reps_at_weight",
    "weekly_sets",
  ],
  reps: ["best_reps", "weekly_sets"],
  time: ["best_duration", "weekly_sets"],
  distance_time: ["best_distance", "weekly_sets"],
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
 * One point per session, oldest first. Sessions without a value for the
 * metric are left out.
 */
export function historySeries(
  type: ExerciseType,
  performances: readonly PerformanceSets[],
  metric: SessionMetric,
  options: HistoryOptions = {},
): HistoryPoint[] {
  const cap = options.e1rmRepCap ?? DEFAULT_E1RM_REP_CAP;
  return performances.flatMap((p) => {
    const value = sessionValue(type, p.sets, metric, cap, options.weightKg);
    return value === undefined
      ? []
      : [{ at: p.startedAt, value, sessionId: p.sessionId }];
  });
}

/**
 * Each set's e1RM, one series per set number: set 1 of every session, set 2,
 * and so on, like the reference sets of the markers. A session without that
 * set, or with it above the e1RM cap, has no point in its series.
 */
export function setE1rmSeries(
  performances: readonly PerformanceSets[],
  options: HistoryOptions = {},
): { setNumber: number; points: HistoryPoint[] }[] {
  const cap = options.e1rmRepCap ?? DEFAULT_E1RM_REP_CAP;
  const series: HistoryPoint[][] = [];
  for (const p of performances) {
    p.sets.forEach((set, i) => {
      const value = setE1rm(set, cap);
      if (value === undefined) return;
      series[i] ??= [];
      series[i].push({ at: p.startedAt, value, sessionId: p.sessionId });
    });
  }
  return series.flatMap((points, i) =>
    points ? [{ setNumber: i + 1, points }] : [],
  );
}

function sessionValue(
  type: ExerciseType,
  sets: readonly SetValues[],
  metric: SessionMetric,
  cap: number,
  weightKg: number | undefined,
): number | undefined {
  switch (metric) {
    case "best_e1rm":
      return max(sets.map((s) => setE1rm(s, cap)));
    case "top_weight":
      return max(sets.map((s) => positive(s.weight_kg)));
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
    case "best_duration":
      return max(sets.map((s) => positive(s.duration_s)));
    case "best_distance":
      return max(sets.map((s) => positive(s.distance_m)));
  }
}

/**
 * Sets of the exercise in every week of the range, empty weeks included.
 * Without `from`, the range starts at the first performance. The average
 * stops at the week of the last performance, so an exercise that was
 * dropped keeps the average it had while it was done.
 */
export function weeklySets(
  performances: readonly PerformanceSets[],
  range: { from?: IsoDate | null; to: IsoDate },
  weekStart: WeekStart,
): { weeks: WeekTotal[]; average: number } {
  const first = performances[0];
  const last = performances.at(-1);
  if (!first || !last) return { weeks: [], average: 0 };
  const from = range.from ?? localDate(first.startedAt, first.tz);
  const entries = performances.map((p) => ({
    date: localDate(p.startedAt, p.tz),
    count: p.sets.length,
  }));
  const { weeks } = perWeek(entries, { from, to: range.to }, weekStart);
  const lastDate = localDate(last.startedAt, last.tz);
  const { average } = perWeek(
    entries,
    { from, to: earlierDate(lastDate, range.to) },
    weekStart,
  );
  return { weeks, average };
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

export type HeadlineKind = "e1rm" | "weight" | "reps" | "duration" | "distance";

export interface HeadlineRecord {
  kind: HeadlineKind;
  /** kg, reps, s, or m. */
  value: number;
  /** The set that holds it. */
  set: SetValues;
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
  weight_reps: ["e1rm", "weight"],
  bodyweight_reps: ["e1rm", "weight", "reps"],
  reps: ["reps"],
  time: ["duration"],
  distance_time: ["distance"],
};

/** The records an exercise type headlines, most telling first. */
export function headlineKinds(type: ExerciseType): readonly HeadlineKind[] {
  return HEADLINES[type];
}

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
    set: SetValues,
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

/** Groups weights that differ by float noise, e.g. converted from lb. */
function weightKey(kg: number) {
  return kg.toFixed(4);
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
