import {
  displayDerived,
  type ExerciseType,
  type HeadlineKind,
  type HistoryMetric,
  type WeightUnit,
} from "@workout-logger/core";
import { formatDuration, formatKm } from "../../lib/format.ts";

export const METRIC_LABELS: Record<HistoryMetric, string> = {
  best_e1rm: "Best e1RM",
  set_e1rm: "Every set's e1RM",
  top_weight: "Top weight",
  volume: "Volume",
  reps_at_weight: "Reps at a weight",
  best_reps: "Most reps",
  total_reps: "Total reps",
  best_duration: "Longest",
  total_duration: "Total time",
  best_distance: "Longest",
  total_distance: "Total distance",
};

export const HEADLINE_LABELS: Record<HeadlineKind, string> = {
  e1rm: "Best e1RM",
  weight: "Heaviest weight",
  reps: "Most reps",
  duration: "Longest set",
  distance: "Longest distance",
  session_volume: "Most volume in a session",
  session_reps: "Most reps in a session",
  session_duration: "Most time in a session",
  session_distance: "Most distance in a session",
};

type Measure = "kg" | "reps" | "s" | "m";

const METRIC_MEASURES: Record<HistoryMetric, Measure> = {
  best_e1rm: "kg",
  set_e1rm: "kg",
  top_weight: "kg",
  volume: "kg",
  reps_at_weight: "reps",
  best_reps: "reps",
  total_reps: "reps",
  best_duration: "s",
  total_duration: "s",
  best_distance: "m",
  total_distance: "m",
};

const HEADLINE_MEASURES: Record<HeadlineKind, Measure> = {
  e1rm: "kg",
  weight: "kg",
  reps: "reps",
  duration: "s",
  distance: "m",
  session_volume: "kg",
  session_reps: "reps",
  session_duration: "s",
  session_distance: "m",
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
  metric: HistoryMetric,
  value: number,
  unit: WeightUnit,
) {
  return formatMeasure(METRIC_MEASURES[metric], value, unit);
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
