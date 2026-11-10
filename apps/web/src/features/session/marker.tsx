import type { ProgressMarker } from "@workout-logger/core";
import { ArrowUp, Star, Trophy } from "lucide-react";

const LABELS: Record<ProgressMarker, string> = {
  pr: "Personal record",
  set_record: "Set record",
  weight_increase: "Weight increase",
};

/** PR: trophy. Set record: outline star. Weight increase: up arrow. */
export function Marker({ marker }: { marker: ProgressMarker | null }) {
  if (!marker) return null;
  const label = LABELS[marker];
  return (
    <span role="img" aria-label={label} title={label} className="inline-flex">
      {marker === "pr" && (
        <Trophy size={18} strokeWidth={2.25} className="text-pr" />
      )}
      {marker === "set_record" && (
        <Star size={18} strokeWidth={2.25} className="text-record" />
      )}
      {marker === "weight_increase" && (
        <ArrowUp size={18} strokeWidth={2.75} className="text-increase" />
      )}
    </span>
  );
}
