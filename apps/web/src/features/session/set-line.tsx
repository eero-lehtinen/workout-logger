import type {
  ExerciseType,
  ProgressMarker,
  SetValues,
  WeightUnit,
} from "@workout-logger/core";
import { SetText } from "../../components/set-text.tsx";
import { Marker } from "./marker.tsx";

/**
 * Logged sets as they read anywhere outside the logging screen: one quiet,
 * wrapping line of dot-separated sets, each with the marker it earned, e.g.
 * "100 kg × 8 🏆 · 100 kg × 7". The logging screen has its own large figures, since sets there
 * are tapped and compared. Markers are icons only: the line usually sits
 * inside a link, and an explained marker is a button.
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
    <ul className="flex flex-wrap gap-x-2 gap-y-0.5 text-[0.9375rem] text-ink/85">
      {props.sets.map((set, i) => (
        <li
          key={set.id ?? i}
          className="tabular inline-flex items-center gap-1"
        >
          {i > 0 && (
            <span
              aria-hidden
              className="mr-1 size-1 shrink-0 rounded-full bg-ink-muted/35"
            />
          )}
          <span>
            <SetText set={set} type={props.type} unit={props.unit} />
          </span>
          {set.marker && (
            <Marker
              marker={set.marker}
              type={props.type}
              unit={props.unit}
              size={15}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
