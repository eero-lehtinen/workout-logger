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
import { useTranslation } from "react-i18next";
import { Button } from "../../components/button.tsx";
import { fieldLabelClass } from "../../components/headings.tsx";
import { InlineName } from "../../components/inline-name.tsx";
import { MoreMenu } from "../../components/more-menu.tsx";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { Confirm } from "../../components/sheet.tsx";
import { useCommand, useDbQuery } from "../../db/react.tsx";
import { useGoBack } from "../../lib/navigation.ts";
import { ExercisePicker } from "../exercises/picker.tsx";
import { DayCard } from "./day-card.tsx";
import { ReorderDaysSheet } from "./reorder-days-sheet.tsx";
import { SlotSheet } from "./slot-sheet.tsx";

const route = getRouteApi("/routines/$routineId");

type PickTarget =
  | { kind: "slot"; dayId: string }
  | { kind: "slotExercise"; slotId: string }
  | { kind: "alternative"; slotId: string };

const PICKER_TITLE_KEYS = {
  slot: "routines.editor.pickAddExercise",
  slotExercise: "routines.editor.pickChangeExercise",
  alternative: "routines.editor.pickAddAlternative",
} as const satisfies Record<PickTarget["kind"], string>;

export function RoutineEditor() {
  const { t } = useTranslation();
  const { routineId } = route.useParams();
  const search = route.useSearch();
  const routine = useDbQuery("routineDetail", { routineId });
  const back = search.sessionId
    ? {
        to: "/sessions/$sessionId" as const,
        params: { sessionId: search.sessionId },
        label: t("routines.editor.backToSession"),
      }
    : {
        to: "/routines" as const,
        label: t("routines.editor.backToRoutines"),
      };
  if (!routine) {
    return (
      <Screen
        header={<PageHeader title={t("routines.editor.title")} back={back} />}
        scrollId="routine-deleted"
      >
        <Empty>{t("routines.editor.deleted")}</Empty>
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
  const { t } = useTranslation();
  const command = useCommand();
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft !== null && draft.trim() !== routine.description) {
      command("updateRoutine", { routineId: routine.id, description: draft });
    }
    setDraft(null);
  };
  return (
    <label className="flex max-w-3xl flex-col gap-1.5 px-4 pb-2 lg:px-0">
      <span className={fieldLabelClass}>
        {t("routines.editor.description")}
      </span>
      <textarea
        value={draft ?? routine.description}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        placeholder={t("routines.editor.descriptionPlaceholder")}
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
  const { t } = useTranslation();
  useEffect(() => {
    if (highlightDayId) {
      document
        .getElementById(`day-${highlightDayId}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightDayId]);
  const command = useCommand();
  const navigate = useNavigate();
  const goBack = useGoBack();
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
    const copyId = await command("duplicateRoutine", {
      routineId: routine.id,
      name: t("routines.copyName", { name: routine.name }),
    });
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
              label={t("routines.editor.name")}
              value={routine.name}
              select={isNew}
              onSave={(name) =>
                command("updateRoutine", { routineId: routine.id, name })
              }
              className="w-full"
            />
          }
          subtitle={
            routine.archived ? t("routines.editor.archivedSubtitle") : undefined
          }
          back={back}
          actions={
            <MoreMenu
              label={t("routines.editor.moreActions")}
              items={[
                {
                  label: routine.archived
                    ? t("routines.editor.unarchive")
                    : t("routines.editor.archive"),
                  icon: routine.archived ? (
                    <ArchiveRestore size={18} />
                  ) : (
                    <Archive size={18} />
                  ),
                  onClick: () => void toggleArchived(),
                },
                {
                  label: t("routines.editor.duplicate"),
                  icon: <Copy size={18} />,
                  onClick: () => void duplicate(),
                },
                {
                  label: t("routines.editor.deleteRoutine"),
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
        <Empty>{t("routines.editor.noDays")}</Empty>
      )}
      {routine.days.length > 1 && (
        <div className="flex items-center px-4 pt-2 lg:px-0">
          <span className={`${fieldLabelClass} flex-1`}>
            {t("routines.editor.days", { count: routine.days.length })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("routines.editor.reorderDays")}
            onClick={() => setReordering(true)}
          >
            <ArrowUpDown size={16} />
            {t("routines.editor.reorder")}
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
          placeholder={t("routines.editor.newDayPlaceholder")}
          aria-label={t("routines.editor.newDayName")}
          className="h-10 min-w-0 flex-1 rounded-xl bg-raised px-3 outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink"
        />
        <Button type="submit" disabled={!dayName.trim()}>
          {t("routines.editor.addDay")}
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
        title={pick ? t(PICKER_TITLE_KEYS[pick.kind]) : ""}
        onPick={onPick}
      />
      <Confirm
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("routines.editor.deleteTitle", { name: routine.name })}
        description={t("routines.editor.deleteDescription")}
        actions={[
          {
            label: t("routines.editor.deleteRoutine"),
            variant: "danger",
            onClick: async () => {
              await command(
                "deleteRoutine",
                { routineId: routine.id },
                {
                  undoLabel: t("routines.editor.deletedUndo", {
                    name: routine.name,
                  }),
                },
              );
              await goBack(back);
            },
          },
        ]}
      />
    </Screen>
  );
}
