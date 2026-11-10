import type {
  ExerciseType,
  ProgressMarker,
  SetValues,
  WeightUnit,
} from "@workout-logger/core";
import { formatSet } from "../../lib/format.ts";
import { Marker } from "./marker.tsx";

/**
 * A finished performance's sets on one wrapping line, each after its small
 * set number, e.g. "1 125 × 6   2 125 × 5". Quiet on purpose: the bold
 * numerals are for the sets being logged. Markers are icons only, since the
 * line usually sits inside a link and their explanation is a button.
 */
export function SetLine(props: {
  sets: readonly (SetValues & {
    id?: string;
    marker?: ProgressMarker | null;
  })[];
  type: ExerciseType;
  unit: WeightUnit;
}) {
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-0.5 text-[0.9375rem] text-ink-muted">
      {props.sets.map((set, i) => (
        <li key={set.id ?? i} className="inline-flex items-center gap-1.5">
          <span className="tabular text-xs">{i + 1}</span>
          <span className="tabular text-ink/85">
            {formatSet(set, props.type, props.unit)}
          </span>
          {set.marker && (
            <Marker marker={set.marker} type={props.type} unit={props.unit} />
          )}
        </li>
      ))}
    </ol>
  );
}
