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

export interface WeekCount {
  /** The week's first date. */
  week: IsoDate;
  sessions: number;
}

/**
 * Sessions per week over every week of the range, empty weeks included.
 * `dates` holds one calendar date per session.
 */
export function sessionsPerWeek(
  dates: readonly IsoDate[],
  range: DateRange,
  weekStart: WeekStart,
): { weeks: WeekCount[]; average: number } {
  const counts = new Map<IsoDate, number>();
  for (const date of dates) {
    if (date < range.from || date > range.to) continue;
    const week = weekOf(date, weekStart);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  const weeks = weeksBetween(range.from, range.to, weekStart).map((week) => ({
    week,
    sessions: counts.get(week) ?? 0,
  }));
  const total = weeks.reduce((n, w) => n + w.sessions, 0);
  return { weeks, average: weeks.length > 0 ? total / weeks.length : 0 };
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

export interface MuscleGroupFrequency {
  group: string;
  /** Average over every week of the range. */
  daysPerWeek: number;
  /** The latest date the group was trained, in or before the range. */
  lastDate: IsoDate | null;
}

/**
 * Days per week each muscle group was trained. A date counts once per group
 * however many sessions or exercises hit it. `groups` lists every group to
 * report, in display order.
 */
export function muscleGroupFrequency(
  days: readonly { date: IsoDate; groups: readonly string[] }[],
  groups: readonly string[],
  range: DateRange,
  weekStart: WeekStart,
): MuscleGroupFrequency[] {
  const weeks = weeksBetween(range.from, range.to, weekStart).length;
  return groups.map((group) => {
    const dates = new Set<IsoDate>();
    let lastDate: IsoDate | null = null;
    for (const day of days) {
      if (!day.groups.includes(group) || day.date > range.to) continue;
      if (lastDate === null || day.date > lastDate) lastDate = day.date;
      if (day.date >= range.from) dates.add(day.date);
    }
    return {
      group,
      daysPerWeek: weeks > 0 ? dates.size / weeks : 0,
      lastDate,
    };
  });
}
