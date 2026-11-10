import {
  type ExerciseType,
  type LoggedSet,
  roundTo,
  type Settings,
  stepWeight,
  type WeightUnit,
  weightIncrement,
} from "@workout-logger/core";
import { useState } from "react";
import { Button } from "../../components/button.tsx";
import { Sheet } from "../../components/sheet.tsx";
import {
  parseDuration,
  Stepper,
  type StepperProps,
} from "../../components/stepper.tsx";
import { useCommand } from "../../db/react.tsx";
import { formatDuration } from "../../lib/format.ts";
import {
  type Entry,
  type EntryField,
  entryFromSet,
  FIELDS,
  setFromEntry,
} from "./entry.ts";

const formatWeightInput = (value: number) => String(roundTo(value, 2));

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
      label: props.type === "bodyweight_reps" ? "Added" : "Weight",
      unit,
      value: entry.weight,
      onChange: (v) => set("weight", v),
      step: (v, d) => stepWeight(v, increment, d),
      format: formatWeightInput,
    },
    reps: {
      label: "Reps",
      value: entry.reps,
      inputMode: "numeric",
      onChange: (v) => set("reps", v === null ? null : Math.round(v)),
      step: (v, d) => Math.max(0, Math.round(v) + d),
    },
    durationS: {
      label: "Time",
      value: entry.durationS,
      inputMode: "numeric",
      onChange: (v) => set("durationS", v),
      step: (v, d) => Math.max(0, Math.round(v / 5) * 5 + d * 5),
      format: formatDuration,
      parse: parseDuration,
    },
    distanceKm: {
      label: "Distance",
      unit: "km",
      value: entry.distanceKm,
      onChange: (v) => set("distanceKm", v),
      step: (v, d) => Math.max(0, roundTo(v + d * 0.1, 2)),
      format: (v) => String(roundTo(v, 2)),
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
/** Edits or deletes a logged set. */
export function EditSetSheet(props: {
  set: LoggedSet | null;
  onClose: () => void;
  type: ExerciseType;
  unit: WeightUnit;
  incrementKg: number | null;
  settings: Settings;
}) {
  return (
    <Sheet
      open={props.set !== null}
      onOpenChange={(open) => !open && props.onClose()}
      title="Edit set"
    >
      {props.set && (
        <EditSetForm key={props.set.id} {...props} set={props.set} />
      )}
    </Sheet>
  );
}

function EditSetForm(props: {
  set: LoggedSet;
  onClose: () => void;
  type: ExerciseType;
  unit: WeightUnit;
  incrementKg: number | null;
  settings: Settings;
}) {
  const command = useCommand();
  const [entry, setEntry] = useState(() => entryFromSet(props.set, props.unit));
  const values = setFromEntry(entry, props.type, props.unit);
  return (
    <div className="flex flex-col gap-4 p-4">
      <EntryFields
        type={props.type}
        entry={entry}
        onChange={setEntry}
        unit={props.unit}
        incrementKg={props.incrementKg}
        settings={props.settings}
        size="md"
      />
      <div className="flex gap-2">
        <Button
          variant="danger"
          onClick={async () => {
            props.onClose();
            await command(
              "deleteSet",
              { setId: props.set.id },
              { undoLabel: "Set deleted" },
            );
          }}
        >
          Delete set
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={!values}
          onClick={async () => {
            if (!values) return;
            props.onClose();
            await command(
              "updateSet",
              { setId: props.set.id, values },
              { undoLabel: "Set changed" },
            );
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
