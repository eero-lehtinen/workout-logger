import { Popover } from "@base-ui/react/popover";
import {
  displayDerived,
  type ExerciseType,
  formatWeight,
  type MarkerExplanation,
  type ProgressMarker,
  type WeightUnit,
} from "@workout-logger/core";
import { ArrowUp, Star, Trophy } from "lucide-react";
import {
  formatDuration,
  formatKm,
  formatSessionDate,
  formatSet,
} from "../../lib/format.ts";

const LABELS: Record<ProgressMarker, string> = {
  pr: "Personal record",
  set_record: "Set record",
  weight_increase: "Weight increase",
};

/** PR: trophy. Set record: outline star. Weight increase: up arrow. */
function MarkerIcon(props: { marker: ProgressMarker; size: number }) {
  const { marker, size } = props;
  if (marker === "pr") {
    return <Trophy size={size} strokeWidth={2.25} className="text-pr" />;
  }
  if (marker === "set_record") {
    return <Star size={size} strokeWidth={2.25} className="text-record" />;
  }
  return <ArrowUp size={size} strokeWidth={2.75} className="text-increase" />;
}

/**
 * A progress marker. With a basis it is a button that explains, on tap,
 * what the set was compared with.
 */
export function Marker(props: {
  marker: ProgressMarker | null;
  basis?: MarkerExplanation | null;
  type: ExerciseType;
  unit: WeightUnit;
  /** Icon size; smaller beside running text than beside logged sets. */
  size?: number;
}) {
  const { marker, basis } = props;
  if (!marker) return null;
  const label = LABELS[marker];
  if (!basis) {
    return (
      <span role="img" aria-label={label} title={label} className="inline-flex">
        <MarkerIcon marker={marker} size={props.size ?? 18} />
      </span>
    );
  }
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={label}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl hover:bg-surface data-popup-open:bg-surface"
      >
        <MarkerIcon marker={marker} size={props.size ?? 18} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="z-40" side="top" sideOffset={6}>
          <Popover.Popup className="w-max max-w-80 origin-[var(--transform-origin)] rounded-2xl border border-rule bg-raised p-3 text-ink shadow-lg outline-none transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <Popover.Title className="flex items-center gap-1.5 text-sm font-semibold">
              <MarkerIcon marker={marker} size={18} />
              {label}
            </Popover.Title>
            <Comparison
              marker={marker}
              basis={basis}
              type={props.type}
              unit={props.unit}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** This set's value next to what it beat. */
function Comparison(props: {
  marker: ProgressMarker;
  basis: MarkerExplanation;
  type: ExerciseType;
  unit: WeightUnit;
}) {
  const { basis, type, unit } = props;
  const { against } = basis;
  const set = formatSet(against, type, unit);
  const when = against.sameSession
    ? "earlier today"
    : `on ${formatSessionDate(against.startedAt, against.tz)}`;
  // A PR beats the best of all earlier sets; the other markers compare with
  // the same set number last time.
  const label =
    props.marker === "pr"
      ? "Best before"
      : `Last time, set ${against.setNumber}`;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-2 text-sm">
      <dt className="text-ink-muted">This set</dt>
      <dd className="font-medium">
        {basis.measure === "weight_and_reps"
          ? "More weight or reps"
          : amount(basis.measure, basis.value, unit)}
      </dd>
      <dt className="text-ink-muted">{label}</dt>
      <dd>
        {basis.measure !== "weight_and_reps" && (
          <div className="font-medium">
            {amount(basis.measure, basis.compared, unit)}
          </div>
        )}
        <div className="text-xs text-ink-muted">
          {set} {when}
        </div>
      </dd>
    </dl>
  );
}

/** A value of the measure with its unit, e.g. `126.7 kg e1RM`, `12 reps`. */
function amount(
  measure: MarkerExplanation["measure"],
  value: number | null,
  unit: WeightUnit,
): string {
  if (value === null) return "";
  switch (measure) {
    case "e1rm":
      return `${displayDerived(value, unit)} ${unit} e1RM`;
    case "weight":
      return `${formatWeight(value, unit)} ${unit}`;
    case "reps":
      return `${value} reps`;
    case "duration":
      return formatDuration(value);
    case "distance":
      return `${formatKm(value)} km`;
    case "weight_and_reps":
      return "";
  }
}
