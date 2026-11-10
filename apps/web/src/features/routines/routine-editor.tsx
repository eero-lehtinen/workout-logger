import { getRouteApi, useNavigate } from "@tanstack/react-router";
import type { RoutineDetail } from "@workout-logger/core";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button, IconButton } from "../../components/button.tsx";
import { InlineName } from "../../components/inline-name.tsx";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { Confirm } from "../../components/sheet.tsx";
import { useCommand, useDbQuery } from "../../db/react.tsx";
import { ExercisePicker } from "../exercises/picker.tsx";

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
  const routine = useDbQuery("routineDetail", { routineId });
  if (!routine) {
    return (
      <Screen
        header={
          <PageHeader
            title="Routine"
            back={{ to: "/routines", label: "Back to routines" }}
          />
        }
        scrollId="routine-deleted"
      >
        <Empty>This routine was deleted.</Empty>
      </Screen>
    );
  }
  return <Editor key={routine.id} routine={routine} />;
}

function Editor({ routine }: { routine: RoutineDetail }) {
  const command = useCommand();
  const navigate = useNavigate();
  const [pick, setPick] = useState<PickTarget | null>(null);
  const [dayName, setDayName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  return (
    <Screen
      scrollId="routine"
      header={
        <PageHeader
          title={
            <InlineName
              label="Routine name"
              value={routine.name}
              onSave={(name) =>
                command("updateRoutine", { routineId: routine.id, name })
              }
              className="w-full"
            />
          }
          subtitle={routine.archived ? "Archived" : undefined}
          back={{ to: "/routines", label: "Back to routines" }}
          actions={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  command("updateRoutine", {
                    routineId: routine.id,
                    archived: !routine.archived,
                  })
                }
              >
                {routine.archived ? "Unarchive" : "Archive"}
              </Button>
              <IconButton
                label="Delete routine"
                variant="danger"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={19} />
              </IconButton>
            </>
          }
        />
      }
    >
      {routine.days.length === 0 && (
        <Empty>Add the days of the cycle in the order you train them.</Empty>
      )}
      <ol className="grid grid-cols-1 gap-4 px-4 pt-2 lg:grid-cols-2 lg:px-0 xl:grid-cols-3">
        {routine.days.map((day, dayIndex) => (
          <li
            key={day.id}
            className="rounded-2xl bg-raised p-3 ring-1 ring-rule"
          >
            <div className="flex items-center gap-1">
              <span className="tabular w-6 shrink-0 text-sm text-ink-muted">
                {dayIndex + 1}
              </span>
              <InlineName
                label="Day name"
                value={day.name}
                onSave={(name) => command("renameDay", { dayId: day.id, name })}
                className="flex-1 text-lg font-semibold"
              />
              <IconButton
                label="Move day earlier"
                disabled={dayIndex === 0}
                onClick={() =>
                  command("moveDay", { dayId: day.id, direction: -1 })
                }
              >
                <ArrowUp size={17} />
              </IconButton>
              <IconButton
                label="Move day later"
                disabled={dayIndex === routine.days.length - 1}
                onClick={() =>
                  command("moveDay", { dayId: day.id, direction: 1 })
                }
              >
                <ArrowDown size={17} />
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

            <ol className="mt-2 flex flex-col gap-1">
              {day.slots.map((slot, slotIndex) => (
                <li key={slot.id} className="rounded-xl bg-chalk p-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setPick({ kind: "slotExercise", slotId: slot.id })
                      }
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left font-medium hover:bg-surface"
                      title="Change exercise"
                    >
                      <span className="truncate">
                        {slot.exerciseName ?? "Deleted exercise"}
                      </span>
                      <ArrowLeftRight
                        size={15}
                        className="shrink-0 text-ink-muted"
                      />
                    </button>
                    <IconButton
                      label="Move up"
                      className="size-9"
                      disabled={slotIndex === 0}
                      onClick={() =>
                        command("moveSlot", { slotId: slot.id, direction: -1 })
                      }
                    >
                      <ArrowUp size={16} />
                    </IconButton>
                    <IconButton
                      label="Move down"
                      className="size-9"
                      disabled={slotIndex === day.slots.length - 1}
                      onClick={() =>
                        command("moveSlot", { slotId: slot.id, direction: 1 })
                      }
                    >
                      <ArrowDown size={16} />
                    </IconButton>
                    <IconButton
                      label="Remove from day"
                      variant="danger"
                      className="size-9"
                      onClick={() =>
                        command(
                          "deleteSlot",
                          { slotId: slot.id },
                          {
                            undoLabel: `Removed ${slot.exerciseName ?? "exercise"}`,
                          },
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1">
                    {slot.alternatives.map((alt) => (
                      <span
                        key={alt.id}
                        className="inline-flex h-8 items-center gap-0.5 rounded-full bg-surface pr-0.5 pl-3 text-sm"
                      >
                        {alt.exerciseName ?? "Deleted exercise"}
                        <button
                          type="button"
                          aria-label={`Remove alternative ${alt.exerciseName ?? ""}`}
                          onClick={() =>
                            command("deleteAlternative", {
                              alternativeId: alt.id,
                            })
                          }
                          className="flex size-7 items-center justify-center rounded-full hover:bg-rule"
                        >
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setPick({ kind: "alternative", slotId: slot.id })
                      }
                      className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-sm text-ink-muted hover:bg-surface hover:text-ink"
                    >
                      <Plus size={14} />
                      Alternative
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setPick({ kind: "slot", dayId: day.id })}
            >
              <Plus size={16} />
              Add exercise
            </Button>
          </li>
        ))}
      </ol>

      <form onSubmit={addDay} className="flex max-w-xl gap-2 px-4 pt-4 lg:px-0">
        <input
          value={dayName}
          onChange={(e) => setDayName(e.target.value)}
          placeholder="New day, e.g. Upper A"
          aria-label="New day name"
          className="h-10 min-w-0 flex-1 rounded-lg bg-raised px-3 outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink"
        />
        <Button type="submit" disabled={!dayName.trim()}>
          Add day
        </Button>
      </form>

      <ExercisePicker
        open={pick !== null}
        onOpenChange={(open) => !open && setPick(null)}
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
