import type { ExerciseType, SetValues, WeightUnit } from "@workout-logger/core";
import { setParts } from "../lib/format.ts";

/**
 * A set as `100 kg × 8`, with the unit smaller and muted so the weight and
 * reps stand out. Takes the size and color of the text around it. The unit
 * is `ink-muted` rather than faded: sets often sit in muted text already,
 * and a fainter unit there fails contrast.
 */
export function SetText(props: {
  set: SetValues;
  type: ExerciseType;
  unit: WeightUnit;
}) {
  const parts = setParts(props.set, props.type, props.unit);
  if ("text" in parts) return parts.text;
  return (
    <>
      {parts.weight}{" "}
      <span className="text-[0.75em] font-normal text-ink-muted">
        {parts.unit}
      </span>{" "}
      × {parts.reps}
    </>
  );
}
