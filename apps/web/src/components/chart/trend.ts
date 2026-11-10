import { linearRegression } from "simple-statistics";
import type { TimePoint } from "./types.ts";

const DAY_MS = 86_400_000;

/** Average days in a month, for showing a daily rate per month. */
export const DAYS_PER_MONTH = 365.25 / 12;

export interface Trend {
  /** The fitted line at the first and last point it was fitted to. */
  from: TimePoint;
  to: TimePoint;
  /** Change in value per day. */
  perDay: number;
}

/**
 * The least-squares line through the points within `[start, end]`, which
 * are sorted by time. Null with fewer than three points or when they all
 * share one time: there's no trend to speak of.
 */
export function linearTrend(
  points: readonly TimePoint[],
  start = Number.NEGATIVE_INFINITY,
  end = Number.POSITIVE_INFINITY,
): Trend | null {
  const inside = points.filter((p) => p.t >= start && p.t <= end);
  const first = inside[0]?.t;
  const last = inside.at(-1)?.t;
  if (inside.length < 3 || first === undefined || last === undefined) {
    return null;
  }
  if (last === first) return null;
  const { m, b } = linearRegression(
    inside.map((p) => [(p.t - first) / DAY_MS, p.v]),
  );
  return {
    from: { t: first, v: b },
    to: { t: last, v: b + (m * (last - first)) / DAY_MS },
    perDay: m,
  };
}
