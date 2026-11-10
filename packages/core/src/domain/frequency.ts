import {
  daysBetween,
  type IsoDate,
  type WeekStart,
  weekOf,
  weeksBetween,
} from "./calendar.ts";

/** A date range, both ends included. */
export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

export interface WeekTotal {
  /** The week's first date. */
  week: IsoDate;
  count: number;
}

/**
 * Totals per week over every week of the range, empty weeks included, and
 * their average.
 */
export function perWeek(
  entries: readonly { date: IsoDate; count: number }[],
  range: DateRange,
  weekStart: WeekStart,
): { weeks: WeekTotal[]; average: number } {
  const counts = new Map<IsoDate, number>();
  for (const { date, count } of entries) {
    if (date < range.from || date > range.to) continue;
    const week = weekOf(date, weekStart);
    counts.set(week, (counts.get(week) ?? 0) + count);
  }
  const weeks = weeksBetween(range.from, range.to, weekStart).map((week) => ({
    week,
    count: counts.get(week) ?? 0,
  }));
  const total = weeks.reduce((n, w) => n + w.count, 0);
  return { weeks, average: weeks.length > 0 ? total / weeks.length : 0 };
}

/** Sessions per week. `dates` holds one calendar date per session. */
export function sessionsPerWeek(
  dates: readonly IsoDate[],
  range: DateRange,
  weekStart: WeekStart,
) {
  return perWeek(
    dates.map((date) => ({ date, count: 1 })),
    range,
    weekStart,
  );
}

export interface GapBucket {
  days: number;
  /** The last bucket also counts every longer gap. */
  orMore: boolean;
  count: number;
}

/** Gaps of this many days or more share the last bucket. */
export const GAP_BUCKET_LIMIT = 14;

/**
 * Days from each training day to the next one in the range. Several
 * sessions on one date are one training day.
 */
export function daysBetweenSessions(
  dates: readonly IsoDate[],
  range: DateRange,
): { average: number | null; distribution: GapBucket[] } {
  const days = [...new Set(dates)]
    .filter((d) => d >= range.from && d <= range.to)
    .sort();
  const gaps: number[] = [];
  for (let i = 1; i < days.length; i++) {
    gaps.push(daysBetween(days[i - 1] as IsoDate, days[i] as IsoDate));
  }
  if (gaps.length === 0) return { average: null, distribution: [] };
  const longest = Math.min(Math.max(...gaps), GAP_BUCKET_LIMIT);
  const distribution = Array.from({ length: longest }, (_, i) => ({
    days: i + 1,
    orMore: i + 1 === GAP_BUCKET_LIMIT,
    count: 0,
  }));
  for (const gap of gaps) {
    const bucket = distribution[Math.min(gap, GAP_BUCKET_LIMIT) - 1];
    if (bucket) bucket.count++;
  }
  return {
    average: gaps.reduce((a, b) => a + b, 0) / gaps.length,
    distribution,
  };
}

/** An exercise's logged sets in one session, with its muscle targets. */
export interface TrainedExercise {
  sets: number;
  targets: readonly { muscleId: string; group: string; factor: number }[];
}

export interface WeightedSets {
  /** Muscle id → weighted sets. */
  muscles: Record<string, number>;
  /** Muscle group → weighted sets. */
  groups: Record<string, number>;
}

/**
 * Weighted sets of a session (glossary: each set counts by the muscle target
 * factor). For a group, a set counts once, by its exercise's highest factor
 * among the group's muscles: a row that hits lats and upper back at 1.0 is
 * one back set, not two.
 */
export function weightedSets(
  exercises: readonly TrainedExercise[],
): WeightedSets {
  const muscles: Record<string, number> = {};
  const groups: Record<string, number> = {};
  for (const { sets, targets } of exercises) {
    const groupFactor = new Map<string, number>();
    for (const t of targets) {
      muscles[t.muscleId] = (muscles[t.muscleId] ?? 0) + sets * t.factor;
      groupFactor.set(
        t.group,
        Math.max(groupFactor.get(t.group) ?? 0, t.factor),
      );
    }
    for (const [group, factor] of groupFactor) {
      groups[group] = (groups[group] ?? 0) + sets * factor;
    }
  }
  return { muscles, groups };
}

export interface WeeklyAmount {
  key: string;
  /** Average over every week of the range. */
  perWeek: number;
  /** The latest date with any, in or before the range. */
  lastDate: IsoDate | null;
}

/**
 * The weekly average of per-session amounts by key, e.g. weighted sets by
 * muscle group, for every key in `keys`, in its order.
 */
export function weeklyAverages(
  sessions: readonly {
    date: IsoDate;
    amounts: Readonly<Record<string, number>>;
  }[],
  keys: readonly string[],
  range: DateRange,
  weekStart: WeekStart,
): WeeklyAmount[] {
  const weeks = weeksBetween(range.from, range.to, weekStart).length;
  return keys.map((key) => {
    let total = 0;
    let lastDate: IsoDate | null = null;
    for (const { date, amounts } of sessions) {
      const amount = amounts[key] ?? 0;
      if (amount <= 0 || date > range.to) continue;
      if (lastDate === null || date > lastDate) lastDate = date;
      if (date >= range.from) total += amount;
    }
    return { key, perWeek: weeks > 0 ? total / weeks : 0, lastDate };
  });
}
