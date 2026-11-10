import {
  displayDerived,
  type ExerciseType,
  type HeadlineKind,
  type HistoryMetric,
  type WeightUnit,
} from "@workout-logger/core";
import { DAYS_PER_MONTH } from "../../components/chart/trend.ts";
import { formatDuration, formatKm } from "../../lib/format.ts";

export const METRIC_LABELS: Record<HistoryMetric, string> = {
  best_e1rm: "Best e1RM",
  set_e1rm: "Every set's e1RM",
  top_weight: "Top weight",
  reps_at_weight: "Reps at a weight",
  best_reps: "Most reps",
  best_duration: "Longest",
  best_distance: "Longest",
  weekly_sets: "Sets per week",
};

export const HEADLINE_LABELS: Record<HeadlineKind, string> = {
  e1rm: "Best e1RM",
  weight: "Heaviest weight",
  reps: "Most reps",
  duration: "Longest set",
  distance: "Longest distance",
};

type Measure = "kg" | "reps" | "s" | "m";

/** Metrics plotted as values over time, i.e. all but the weekly set counts. */
export type ValueMetric = Exclude<HistoryMetric, "weekly_sets">;

const METRIC_MEASURES: Record<ValueMetric, Measure> = {
  best_e1rm: "kg",
  set_e1rm: "kg",
  top_weight: "kg",
  reps_at_weight: "reps",
  best_reps: "reps",
  best_duration: "s",
  best_distance: "m",
};

const HEADLINE_MEASURES: Record<HeadlineKind, Measure> = {
  e1rm: "kg",
  weight: "kg",
  reps: "reps",
  duration: "s",
  distance: "m",
};

const derivedFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

/** A value of a measure with its unit, e.g. `116.7 kg`, `12 reps`, `1:30`. */
function formatMeasure(measure: Measure, value: number, unit: WeightUnit) {
  switch (measure) {
    case "kg":
      return `${derivedFormat.format(displayDerived(value, unit))} ${unit}`;
    case "reps":
      return `${Math.round(value)} reps`;
    case "s":
      return formatDuration(value);
    case "m":
      return `${formatKm(value)} km`;
  }
}

export function formatMetric(
  metric: ValueMetric,
  value: number,
  unit: WeightUnit,
) {
  return formatMeasure(METRIC_MEASURES[metric], value, unit);
}

const rateFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  signDisplay: "exceptZero",
});

/** A trend's rate, e.g. `+0.8 kg per month`, from its change per day. */
export function formatTrendRate(
  metric: ValueMetric,
  perDay: number,
  unit: WeightUnit,
) {
  const perMonth = perDay * DAYS_PER_MONTH;
  switch (METRIC_MEASURES[metric]) {
    case "kg":
      return `${rateFormat.format(displayDerived(perMonth, unit))} ${unit} per month`;
    case "reps":
      return `${rateFormat.format(perMonth)} reps per month`;
    case "s":
      return `${rateFormat.format(perMonth)} s per month`;
    case "m":
      return `${rateFormat.format(perMonth / 1000)} km per month`;
  }
}

export function formatHeadline(
  kind: HeadlineKind,
  value: number,
  unit: WeightUnit,
) {
  return formatMeasure(HEADLINE_MEASURES[kind], value, unit);
}

/** Whether the exercise's sets carry a weight. */
export function isWeighted(type: ExerciseType) {
  return type === "weight_reps" || type === "bodyweight_reps";
}
