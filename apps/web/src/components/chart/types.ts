import type { ChartColor } from "./theme.ts";

/**
 * The chart API the screens use. It doesn't depend on the charting library,
 * so screens don't change if the library does.
 */

export interface TimePoint {
  /** Epoch ms. */
  t: number;
  v: number;
}

export interface TimeSeries {
  id: string;
  label: string;
  /** Sorted by `t`. Several points may share a `t`. */
  points: readonly TimePoint[];
  /** `line` connects the points and marks each one; `points` only marks them. */
  kind: "line" | "points";
  color: ChartColor;
  /**
   * Draws a least-squares line through the points in view, refitted on
   * zoom, and states its rate below the chart (`formatTrend`).
   */
  trend?: boolean;
}

export interface TimeChartProps {
  series: readonly TimeSeries[];
  /** Accessible name, e.g. "Best e1RM per session". */
  label: string;
  /** Axis and tooltip text for a value, e.g. "102.5 kg". */
  formatValue: (v: number) => string;
  /** Tooltip text for a time; the axis picks its own granularity. */
  formatTime: (t: number) => string;
  /** Text for a trend's rate of change per day, e.g. "+0.8 kg per month". */
  formatTrend?: (perDay: number) => string;
  /** CSS pixels. */
  height?: number;
  /** Tapping or clicking a point. */
  onSelect?: (seriesId: string, index: number) => void;
}

export interface Bar {
  x: number;
  v: number;
}

export interface BarChartProps {
  bars: readonly Bar[];
  /**
   * `time`: `x` is the epoch ms of a UTC midnight, one bar per week. Long
   * ranges can be zoomed. `category`: `x` is a label value, one bar each.
   */
  xKind: "time" | "category";
  label: string;
  formatX: (x: number) => string;
  /** Tooltip text for a value, e.g. "3 sessions". */
  formatValue: (v: number) => string;
  /** Axis text for a value, e.g. "3"; `formatValue` if not given. */
  formatTick?: (v: number) => string;
  /** A horizontal line across the chart, e.g. the average. */
  reference?: { value: number; label: string };
  color?: ChartColor;
  height?: number;
}
