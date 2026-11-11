import type { RoutineDetail } from "@workout-logger/core";
import { clsx } from "clsx";
import { Timer } from "lucide-react";
import { useState } from "react";
import { fieldLabelClass } from "../../components/headings.tsx";
import { parseDuration } from "../../components/stepper.tsx";
import { useCommand } from "../../db/react.tsx";
import { formatDuration } from "../../lib/format.ts";

export type Slot = RoutineDetail["days"][number]["slots"][number];

const fieldClass =
  "h-10 min-w-0 rounded-xl bg-raised px-2 text-[0.9375rem] outline-none ring-1 ring-rule placeholder:text-ink-muted focus:ring-2 focus:ring-ink";

/**
 * A slot's free-text note and rest override, edited in place. Both save on
 * blur or Enter; clearing a field removes it.
 */
export function SlotDetails(props: {
  slot: Slot;
  /** The global rest default. */
  defaultRestS: number;
}) {
  const { slot } = props;
  const command = useCommand();
  const [note, setNote] = useState<string | null>(null);
  const [rest, setRest] = useState<string | null>(null);
  const restText = slot.restS === null ? "" : formatDuration(slot.restS);
  const restS = rest?.trim() ? parseDuration(rest) : null;
  const restInvalid = rest !== null && rest.trim() !== "" && restS === null;
  const name = slot.exerciseName ?? "exercise";

  const saveNote = () => {
    if (note !== null && note.trim() !== (slot.note ?? "")) {
      command("updateSlot", { slotId: slot.id, note });
    }
    setNote(null);
  };
  const saveRest = () => {
    if (rest === null || restInvalid) return;
    if (restS !== slot.restS) command("updateSlot", { slotId: slot.id, restS });
    setRest(null);
  };
  const keys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span aria-hidden className={fieldLabelClass}>
          Note
        </span>
        <input
          aria-label={`Note for ${name}`}
          value={note ?? slot.note ?? ""}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          onKeyDown={keys}
          placeholder="e.g. heavy, 6-10"
          className={clsx(fieldClass, "w-full")}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span aria-hidden className={fieldLabelClass}>
          Rest (m:ss)
        </span>
        <label
          className={clsx(
            fieldClass,
            "flex w-40 shrink-0 items-center gap-1 focus-within:ring-2 focus-within:ring-ink",
            restInvalid && "ring-2 ring-danger",
          )}
        >
          <Timer size={15} className="shrink-0 text-ink-muted" aria-hidden />
          <span className="sr-only">Rest for {name}, m:ss</span>
          <input
            value={rest ?? restText}
            onChange={(e) => setRest(e.target.value)}
            onBlur={saveRest}
            onKeyDown={keys}
            inputMode="numeric"
            placeholder={`Default ${formatDuration(slot.exerciseRestS ?? props.defaultRestS)}`}
            className="tabular w-full min-w-0 bg-transparent outline-none placeholder:text-ink-muted"
          />
        </label>
      </div>
    </div>
  );
}

/** One line about a slot: its alternatives, note, and rest override. */
export function slotSummary(slot: Slot): string {
  const alternatives = slot.alternatives.length;
  return [
    alternatives === 0
      ? "No alternatives"
      : `${alternatives} ${alternatives === 1 ? "alternative" : "alternatives"}`,
    slot.note,
    slot.restS === null ? null : `Rest ${formatDuration(slot.restS)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
