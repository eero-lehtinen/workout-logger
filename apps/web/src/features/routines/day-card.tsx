import type { RoutineDetail } from "@workout-logger/core";
import { clsx } from "clsx";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "../../components/button.tsx";
import { InlineName } from "../../components/inline-name.tsx";
import { rowClass } from "../../components/list.ts";
import {
  type DragHandle,
  GripHandle,
  SortableList,
} from "../../components/sortable.tsx";
import { useCommand } from "../../db/react.tsx";
import { dayDotClass } from "../history/day-colors.ts";
import { type Slot, slotSummary } from "./slot-details.tsx";

type Day = RoutineDetail["days"][number];

/**
 * A workout day: its name and its slots in order. Each slot is a row with a
 * one-line summary that opens the slot's sheet.
 */
export function DayCard(props: {
  day: Day;
  dayIndex: number;
  highlighted: boolean;
  onOpenSlot: (slotId: string) => void;
  onAddSlot: () => void;
}) {
  const { day } = props;
  const command = useCommand();
  return (
    <div
      id={`day-${day.id}`}
      className={clsx(
        "overflow-clip rounded-2xl bg-raised py-1",
        props.highlighted ? "ring-2 ring-ink/60" : "ring-1 ring-rule",
      )}
    >
      <div className="flex items-center gap-1 pt-1 pr-2 pb-1 pl-4">
        <span
          aria-hidden
          className={`size-2.5 shrink-0 rounded-full ${dayDotClass(props.dayIndex)}`}
        />
        <span className="tabular w-5 shrink-0 pl-1 text-sm text-ink-muted">
          {props.dayIndex + 1}
        </span>
        <InlineName
          label="Day name"
          value={day.name}
          onSave={(name) => command("renameDay", { dayId: day.id, name })}
          className="flex-1 text-lg font-semibold"
        />
        <IconButton
          label={`Duplicate ${day.name}`}
          onClick={() => command("duplicateDay", { dayId: day.id })}
        >
          <Copy size={17} />
        </IconButton>
        <IconButton
          label={`Delete ${day.name}`}
          variant="danger"
          onClick={() =>
            command(
              "deleteDay",
              { dayId: day.id },
              { undoLabel: `Deleted ${day.name}` },
            )
          }
        >
          <Trash2 size={17} />
        </IconButton>
      </div>

      <SortableList
        items={day.slots}
        className={clsx(
          "dividers flex flex-col",
          day.slots.length > 0 && "border-t border-rule",
        )}
        handleLabel={(slot) =>
          `Move ${slot.exerciseName ?? "deleted exercise"}`
        }
        onMove={(slotId, toIndex) => command("moveSlot", { slotId, toIndex })}
        render={(slot, _index, slotHandle) => (
          <SlotRow
            slot={slot}
            handle={slotHandle}
            onOpen={() => props.onOpenSlot(slot.id)}
          />
        )}
      />
      <div className="border-t border-rule px-2">
        <Button
          variant="ghost"
          size="sm"
          className="mt-1"
          onClick={props.onAddSlot}
        >
          <Plus size={16} />
          Add exercise
        </Button>
      </div>
    </div>
  );
}

/** A slot as one row: the exercise and a summary of the rest. */
function SlotRow(props: {
  slot: Slot;
  handle: DragHandle;
  onOpen: () => void;
}) {
  const { slot } = props;
  return (
    <>
      <button
        type="button"
        onClick={props.onOpen}
        className={`${rowClass} flex w-full flex-col items-start py-2.5 pr-13 text-left`}
      >
        <span className="w-full truncate font-medium">
          {slot.exerciseName ?? "Deleted exercise"}
        </span>
        <span className="w-full truncate text-sm text-ink-muted">
          {slotSummary(slot)}
        </span>
      </button>
      {/* Over the row's end rather than beside it, so the row's highlight spans the card. */}
      <div className="absolute inset-y-0 right-1 flex items-center">
        <GripHandle handle={props.handle} />
      </div>
    </>
  );
}
