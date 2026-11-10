import type { RoutineDetail } from "@workout-logger/core";
import { clsx } from "clsx";
import { Timer } from "lucide-react";
import { useState } from "react";
import { parseDuration } from "../../components/stepper.tsx";
import { useCommand } from "../../db/react.tsx";
import { formatDuration } from "../../lib/format.ts";

type Slot = RoutineDetail["days"][number]["slots"][number];

const fieldClass =
  "h-9 min-w-0 rounded-lg bg-raised px-2 text-[0.9375rem] outline-none ring-1 ring-rule placeholder:text-ink-muted focus:ring-2 focus:ring-ink";

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
    <div className="flex gap-1.5 pt-1.5 pl-10">
      <input
        aria-label={`Note for ${name}`}
        value={note ?? slot.note ?? ""}
        onChange={(e) => setNote(e.target.value)}
        onBlur={saveNote}
        onKeyDown={keys}
        placeholder="Note, e.g. heavy, 6-10"
        className={clsx(fieldClass, "flex-1")}
      />
      <label
        className={clsx(
          fieldClass,
          "flex w-24 shrink-0 items-center gap-1 focus-within:ring-2 focus-within:ring-ink",
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
          placeholder={formatDuration(slot.exerciseRestS ?? props.defaultRestS)}
          className="tabular w-full min-w-0 bg-transparent outline-none placeholder:text-ink-muted"
        />
      </label>
    </div>
  );
}
