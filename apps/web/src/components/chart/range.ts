import { dateFormat } from "../../lib/format.ts";
import type { Bar, TimeSeries } from "./types.ts";

export interface Span {
  start: number;
  end: number;
}

const WEEK = 7 * 24 * 3600_000;

/** "Apr 27 – Nov 17, 2025": the shared year or month is written once. */
export function formatSpan(span: Span, timeZone?: "UTC") {
  return dateFormat({
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(timeZone && { timeZone }),
  }).formatRange(span.start, span.end);
}

/** From the first point to the last; undefined without points. */
export function seriesSpan(series: readonly TimeSeries[]): Span | undefined {
  let span: Span | undefined;
  for (const s of series) {
    const first = s.points[0];
    const last = s.points.at(-1);
    if (!first || !last) continue;
    span = {
      start: Math.min(span?.start ?? first.t, first.t),
      end: Math.max(span?.end ?? last.t, last.t),
    };
  }
  return span;
}

/**
 * The days covered by the weekly bars in `window`: from the first one's
 * start to the last one's last day. A bar is in the window if its start is.
 */
export function weeksSpan(
  bars: readonly Bar[],
  window: Span | null,
): Span | undefined {
  const shown = window
    ? bars.filter((b) => b.x >= window.start && b.x <= window.end)
    : bars;
  const first = shown[0];
  const last = shown.at(-1);
  if (!first || !last) return undefined;
  return { start: first.x, end: last.x + WEEK - 1 };
}
