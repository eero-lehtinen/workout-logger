import {
  getRouteApi,
  type LinkProps,
  useNavigate,
} from "@tanstack/react-router";
import type { RoutineDetail } from "@workout-logger/core";
import {
  Archive,
  ArchiveRestore,
  ArrowUpDown,
  Copy,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/button.tsx";
import { fieldLabelClass } from "../../components/headings.tsx";
import { InlineName } from "../../components/inline-name.tsx";
import { MoreMenu } from "../../components/more-menu.tsx";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { Confirm } from "../../components/sheet.tsx";
import { useCommand, useDbQuery } from "../../db/react.tsx";
import { ExercisePicker } from "../exercises/picker.tsx";
import { DayCard } from "./day-card.tsx";
import { ReorderDaysSheet } from "./reorder-days-sheet.tsx";
import { SlotSheet } from "./slot-sheet.tsx";

const route = getRouteApi("/routines/$routineId");

type PickTarget =
  | { kind: "slot"; dayId: string }
  | { kind: "slotExercise"; slotId: string }
  | { kind: "alternative"; slotId: string };

const PICKER_TITLES: Record<PickTarget["kind"], string> = {
  slot: "Add exercise",
  slotExercise: "Change exercise",
  alternative: "Add alternative",
};

export function RoutineEditor() {
  const { routineId } = route.useParams();
  const search = route.useSearch();
  const routine = useDbQuery("routineDetail", { routineId });
  const back = search.sessionId
    ? {
        to: "/sessions/$sessionId" as const,
        params: { sessionId: search.sessionId },
        label: "Back to session",
      }
    : { to: "/routines" as const, label: "Back to routines" };
  if (!routine) {
    return (
      <Screen
        header={<PageHeader title="Routine" back={back} />}
        scrollId="routine-deleted"
      >
        <Empty>This routine was deleted.</Empty>
      </Screen>
    );
  }
  return (
    <Editor
      key={routine.id}
      routine={routine}
      back={back}
      highlightDayId={search.dayId ?? null}
      isNew={search.new === true}
    />
  );
}

/** Free text, edited in place; saves on blur. */
function RoutineDescription({ routine }: { routine: RoutineDetail }) {
  const command = useCommand();
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft !== null && draft.trim() !== routine.description) {
      command("updateRoutine", { routineId: routine.id, description: draft });
    }
    setDraft(null);
  };
  return (
    <label className="flex max-w-3xl flex-col gap-1.5 px-4 pt-2 pb-2 lg:px-0">
      <span className={fieldLabelClass}>Description</span>
      <textarea
        value={draft ?? routine.description}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        placeholder="What the routine is for, how to run it"
        rows={1}
        className="field-sizing-content block min-h-10 w-full resize-none rounded-xl bg-raised px-3 py-2 text-[0.9375rem] outline-none ring-1 ring-rule placeholder:text-ink-muted focus:ring-2 focus:ring-ink"
      />
    </label>
  );
}

function Editor({
  routine,
  back,
  highlightDayId,
  isNew,
}: {
  routine: RoutineDetail;
  back: LinkProps & { label: string };
  /** The day of the session the editor was opened from. */
  highlightDayId: string | null;
  /** Just created with a placeholder name. */
  isNew: boolean;
}) {
  useEffect(() => {
    if (highlightDayId) {
      document
        .getElementById(`day-${highlightDayId}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightDayId]);
  const command = useCommand();
  const navigate = useNavigate();
  const settings = useDbQuery("settings");
  const [pick, setPick] = useState<PickTarget | null>(null);
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);
  // A slot's sheet closes while the picker is open, then comes back.
  const reopenSlot = useRef<string | null>(null);
  const [dayName, setDayName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reordering, setReordering] = useState(false);
  const openSlot =
    routine.days.flatMap((d) => d.slots).find((s) => s.id === openSlotId) ??
    null;

  function startPick(target: PickTarget) {
    if (openSlotId) {
      reopenSlot.current = openSlotId;
      setOpenSlotId(null);
    }
    setPick(target);
  }

  async function onPick(exerciseId: string) {
    if (!pick) return;
    if (pick.kind === "slot")
      await command("addSlot", { dayId: pick.dayId, exerciseId });
    if (pick.kind === "slotExercise") {
      await command("setSlotExercise", { slotId: pick.slotId, exerciseId });
    }
    if (pick.kind === "alternative") {
      await command("addAlternative", { slotId: pick.slotId, exerciseId });
    }
  }

  async function addDay(e: React.FormEvent) {
    e.preventDefault();
    const name = dayName.trim();
    if (!name) return;
    if (await command("addDay", { routineId: routine.id, name }))
      setDayName("");
  }

  const toggleArchived = () =>
    command("updateRoutine", {
      routineId: routine.id,
      archived: !routine.archived,
    });
  async function duplicate() {
    const copyId = await command("duplicateRoutine", { routineId: routine.id });
    if (copyId) {
      await navigate({
        to: "/routines/$routineId",
        params: { routineId: copyId },
      });
    }
  }

  return (
    <Screen
      scrollId="routine"
      header={
        <PageHeader
          title={
            <InlineName
              label="Routine name"
              value={routine.name}
              select={isNew}
              onSave={(name) =>
                command("updateRoutine", { routineId: routine.id, name })
              }
              className="w-full"
            />
          }
          subtitle={routine.archived ? "Archived" : undefined}
          back={back}
          actions={
            <MoreMenu
              label="More actions"
              items={[
                {
                  label: routine.archived ? "Unarchive" : "Archive",
                  icon: routine.archived ? (
                    <ArchiveRestore size={18} />
                  ) : (
                    <Archive size={18} />
                  ),
                  onClick: () => void toggleArchived(),
                },
                {
                  label: "Duplicate",
                  icon: <Copy size={18} />,
                  onClick: () => void duplicate(),
                },
                {
                  label: "Delete routine",
                  icon: <Trash2 size={18} />,
                  danger: true,
                  onClick: () => setConfirmDelete(true),
                },
              ]}
            />
          }
        />
      }
    >
      <RoutineDescription routine={routine} />
      {routine.days.length === 0 && (
        <Empty>Add your workout days in the order you do them.</Empty>
      )}
      {routine.days.length > 1 && (
        <div className="flex items-center px-4 pt-2 lg:px-0">
          <span className={`${fieldLabelClass} flex-1`}>
            {routine.days.length} days
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Reorder days"
            onClick={() => setReordering(true)}
          >
            <ArrowUpDown size={16} />
            Reorder
          </Button>
        </div>
      )}
      {/* Columns wide enough for exercise names; fewer columns, not narrower ones, on smaller windows. */}
      <ol className="grid grid-cols-1 gap-4 px-4 pt-2 lg:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] lg:px-0">
        {routine.days.map((day, dayIndex) => (
          <li key={day.id}>
            <DayCard
              day={day}
              dayIndex={dayIndex}
              highlighted={day.id === highlightDayId}
              onOpenSlot={setOpenSlotId}
              onAddSlot={() => startPick({ kind: "slot", dayId: day.id })}
            />
          </li>
        ))}
      </ol>
      <form onSubmit={addDay} className="flex max-w-xl gap-2 px-4 pt-4 lg:px-0">
        <input
          value={dayName}
          onChange={(e) => setDayName(e.target.value)}
          placeholder="New day, e.g. Upper A"
          aria-label="New day name"
          className="h-10 min-w-0 flex-1 rounded-xl bg-raised px-3 outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink"
        />
        <Button type="submit" disabled={!dayName.trim()}>
          Add day
        </Button>
      </form>

      <ReorderDaysSheet
        days={routine.days}
        open={reordering}
        onOpenChange={setReordering}
      />
      <SlotSheet
        slot={openSlot}
        defaultRestS={settings.rest_default_s}
        onClose={() => setOpenSlotId(null)}
        onChangeExercise={(slotId) =>
          startPick({ kind: "slotExercise", slotId })
        }
        onAddAlternative={(slotId) =>
          startPick({ kind: "alternative", slotId })
        }
      />
      <ExercisePicker
        open={pick !== null}
        onOpenChange={(open) => {
          if (open) return;
          setPick(null);
          if (reopenSlot.current) {
            setOpenSlotId(reopenSlot.current);
            reopenSlot.current = null;
          }
        }}
        title={pick ? PICKER_TITLES[pick.kind] : ""}
        onPick={onPick}
      />
      <Confirm
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${routine.name}?`}
        description="Past sessions keep their sets. Archive it instead to hide it from the start screen."
        actions={[
          {
            label: "Delete routine",
            variant: "danger",
            onClick: async () => {
              await command(
                "deleteRoutine",
                { routineId: routine.id },
                { undoLabel: `Deleted ${routine.name}` },
              );
              await navigate({ to: "/routines" });
            },
          },
        ]}
      />
    </Screen>
  );
}
