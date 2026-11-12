import {
  displayDerived,
  type ExerciseType,
  type HeadlineKind,
  type HistoryMetric,
  type WeightUnit,
} from "@workout-logger/core";
import { DAYS_PER_MONTH } from "../../components/chart/trend.ts";
import { i18n } from "../../i18n/index.ts";
import { formatDuration, formatKm, numberFormat } from "../../lib/format.ts";

export function metricLabel(metric: HistoryMetric): string {
  return i18n.t(`history.metrics.${metric}`);
}

export function headlineLabel(kind: HeadlineKind): string {
  return i18n.t(`history.headlines.${kind}`);
}

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

/** A value of a measure with its unit, e.g. `116.7 kg`, `12 reps`, `1:30`. */
function formatMeasure(measure: Measure, value: number, unit: WeightUnit) {
  switch (measure) {
    case "kg":
      return `${numberFormat({ maximumFractionDigits: 1 }).format(displayDerived(value, unit))} ${unit}`;
    case "reps":
      return i18n.t("format.reps", { count: Math.round(value) });
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

/** A trend's rate, e.g. `+0.8 kg per month`, from its change per day. */
export function formatTrendRate(
  metric: ValueMetric,
  perDay: number,
  unit: WeightUnit,
) {
  const perMonth = perDay * DAYS_PER_MONTH;
  const rate = numberFormat({
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    signDisplay: "exceptZero",
  });
  switch (METRIC_MEASURES[metric]) {
    case "kg":
      return i18n.t("history.trend.weight", {
        value: rate.format(displayDerived(perMonth, unit)),
        unit,
      });
    case "reps":
      return i18n.t("history.trend.reps", { value: rate.format(perMonth) });
    case "s":
      return i18n.t("history.trend.seconds", { value: rate.format(perMonth) });
    case "m":
      return i18n.t("history.trend.distance", {
        value: rate.format(perMonth / 1000),
      });
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
