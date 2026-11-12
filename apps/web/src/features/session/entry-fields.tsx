import {
  type ExerciseType,
  roundTo,
  type Settings,
  stepWeight,
  type WeightUnit,
  weightIncrement,
} from "@workout-logger/core";
import { useTranslation } from "react-i18next";
import {
  parseDuration,
  Stepper,
  type StepperProps,
} from "../../components/stepper.tsx";
import { formatDuration, numberFormat } from "../../lib/format.ts";
import { type Entry, type EntryField, FIELDS } from "./entry.ts";

const formatDecimalInput = (value: number) =>
  numberFormat({ maximumFractionDigits: 2, useGrouping: false }).format(value);

export function EntryFields(props: {
  type: ExerciseType;
  entry: Entry;
  onChange: (entry: Entry) => void;
  unit: WeightUnit;
  incrementKg: number | null;
  settings: Settings;
  size?: "lg" | "md";
}) {
  const { entry, onChange, unit } = props;
  const { t } = useTranslation();
  const increment = weightIncrement(
    unit,
    props.incrementKg,
    unit === "kg"
      ? props.settings.weight_increment_kg
      : props.settings.weight_increment_lb,
  );
  const set = <K extends keyof Entry>(key: K, value: Entry[K]) =>
    onChange({ ...entry, [key]: value });

  const steppers: Record<EntryField, Omit<StepperProps, "size">> = {
    weight: {
      label:
        props.type === "bodyweight_reps"
          ? t("session.entry.added")
          : t("session.entry.weight"),
      unit,
      value: entry.weight,
      onChange: (v) => set("weight", v),
      step: (v, d) => stepWeight(v, increment, d),
      format: formatDecimalInput,
    },
    reps: {
      label: t("session.entry.reps"),
      value: entry.reps,
      inputMode: "numeric",
      onChange: (v) => set("reps", v === null ? null : Math.round(v)),
      step: (v, d) => Math.max(0, Math.round(v) + d),
    },
    durationS: {
      label: t("session.entry.time"),
      value: entry.durationS,
      inputMode: "numeric",
      onChange: (v) => set("durationS", v),
      step: (v, d) => Math.max(0, Math.round(v / 5) * 5 + d * 5),
      format: formatDuration,
      parse: parseDuration,
    },
    distanceKm: {
      label: t("session.entry.distance"),
      unit: "km",
      value: entry.distanceKm,
      onChange: (v) => set("distanceKm", v),
      step: (v, d) => Math.max(0, roundTo(v + d * 0.1, 2)),
      format: formatDecimalInput,
    },
  };

  return (
    <div className="flex flex-col gap-2">
      {FIELDS[props.type].map((field) => (
        <Stepper key={field} size={props.size} {...steppers[field]} />
      ))}
    </div>
  );
}
