import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
  type EffectiveEnd,
  type ExerciseLog,
  effectiveSessionEnd,
  type LoggedSet,
  type Performance,
  type SetValues,
} from "@workout-logger/core";
import { clsx } from "clsx";
import {
  ArrowLeftRight,
  ChartLine,
  ChevronDown,
  NotebookPen,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, quietButtonClass } from "../../components/button.tsx";
import { MoreMenu } from "../../components/more-menu.tsx";
import { NotesField } from "../../components/notes-field.tsx";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { Confirm } from "../../components/sheet.tsx";
import { IconTip } from "../../components/tooltip.tsx";
import { useCommand, useDbQuery } from "../../db/react.tsx";
import {
  deviceTimeZone,
  formatSessionDate,
  formatSet,
  formatTime,
} from "../../lib/format.ts";
import { useGoBack } from "../../lib/navigation.ts";
import { ALERT_VOLUMES } from "../../lib/rest-alarm.ts";
import { restTimer } from "../../lib/rest-timer.ts";
import { ExercisePicker } from "../exercises/picker.tsx";
import { type Entry, entryFromSet, setFromEntry } from "./entry.ts";
import { EntryFields } from "./entry-fields.tsx";
import { Marker } from "./marker.tsx";
import { RestControls } from "./rest-bar.tsx";
import { wasResumed } from "./running.ts";
import { Substitutes } from "./substitutes.tsx";

const route = getRouteApi("/sessions/$sessionId/$sessionExerciseId");

export function ExerciseLogPage() {
  const { t } = useTranslation();
  const { sessionId, sessionExerciseId } = route.useParams();
  const log = useDbQuery("exerciseLog", { sessionExerciseId });
  if (!log) {
    return (
      <Screen
        header={
          <PageHeader
            title={t("session.log.exercise")}
            back={{
              to: "/sessions/$sessionId",
              params: { sessionId },
              label: t("session.log.backToSession"),
            }}
          />
        }
        scrollId="exercise-removed"
        width="logPane"
      >
        <Empty>{t("session.log.removed")}</Empty>
      </Screen>
    );
  }
  return <Logger key={log.sessionExerciseId} log={log} />;
}

function Logger({ log }: { log: ExerciseLog }) {
  const { t } = useTranslation();
  const settings = useDbQuery("settings");
  const unit = settings.weight_unit;
  const command = useCommand();
  const navigate = useNavigate();
  const goBack = useGoBack();
  const { exercise } = log;

  // Reset the entry to the prefill after each logged or removed set.
  const prefillKey = `${log.sets.length}`;
  const [entry, setEntry] = useState<Entry>(() =>
    entryFromSet(log.prefill, unit),
  );
  const [entryKey, setEntryKey] = useState(prefillKey);
  if (entryKey !== prefillKey) {
    setEntryKey(prefillKey);
    setEntry(entryFromSet(log.prefill, unit));
  }

  // Editing a logged set reuses the entry footer. The next set's draft stays
  // in `entry` meanwhile.
  const [editing, setEditing] = useState<{
    setId: string;
    entry: Entry;
  } | null>(null);
  const editIndex = editing
    ? log.sets.findIndex((s) => s.id === editing.setId)
    : -1;
  if (editing && editIndex === -1) setEditing(null);
  const editValues = editing
    ? setFromEntry(editing.entry, exercise.type, unit)
    : null;

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setEditing(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  function toggleEdit(set: LoggedSet) {
    setEditing(
      editing?.setId === set.id
        ? null
        : { setId: set.id, entry: entryFromSet(set, unit) },
    );
  }

  function fillFrom(set: SetValues) {
    const filled = entryFromSet(set, unit);
    if (editing) setEditing({ ...editing, entry: filled });
    else setEntry(filled);
  }

  async function saveEdit() {
    if (!editing || !editValues) return;
    const { setId } = editing;
    setEditing(null);
    await command(
      "updateSet",
      { setId, values: editValues },
      { undoLabel: t("session.log.setChanged") },
    );
  }

  async function deleteEdited() {
    if (!editing) return;
    const { setId } = editing;
    setEditing(null);
    await command(
      "deleteSet",
      { setId },
      { undoLabel: t("session.log.setDeleted") },
    );
  }
  const [substituting, setSubstituting] = useState(false);
  const [ended, setEnded] = useState<Extract<
    EffectiveEnd,
    { running: false }
  > | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const showNotes = addingNote || log.notes !== "";
  const values = setFromEntry(entry, exercise.type, unit);

  async function logInto(
    sessionId: string,
    sessionExerciseId: string,
    set: SetValues,
  ) {
    const id = await command("logSet", { sessionExerciseId, values: set });
    if (id && settings.rest_timer_enabled) {
      restTimer.start(
        log.restSeconds,
        { sessionId, sessionExerciseId },
        ALERT_VOLUMES[settings.rest_alert_volume],
      );
    }
    return id;
  }

  function onLog() {
    if (!values) return;
    const end = effectiveSessionEnd(
      {
        started_at: log.session.startedAt,
        ended_at: log.session.endedAt,
        end_reason: log.session.endReason,
      },
      log.session.lastSetAt,
      Date.now(),
      settings.idle_threshold_s * 1000,
    );
    if (end.running || (end.reason === "idle" && wasResumed(log.session.id))) {
      void logInto(log.session.id, log.sessionExerciseId, values);
    } else setEnded(end);
  }

  async function continueSession() {
    if (!values) return;
    if (log.session.endedAt !== null) {
      await command("resumeSession", { sessionId: log.session.id });
    }
    await logInto(log.session.id, log.sessionExerciseId, values);
  }

  async function startNewSession() {
    if (!values) return;
    const sessionId = await command("startSession", {
      routineId: log.session.routineId,
      dayId: log.session.dayId,
      withSlots: false,
    });
    if (!sessionId) return;
    const sessionExerciseId = await command("addSessionExercise", {
      sessionId,
      exerciseId: exercise.id,
      slotId: log.slotId,
    });
    if (!sessionExerciseId) return;
    await logInto(sessionId, sessionExerciseId, values);
    await navigate({
      to: "/sessions/$sessionId/$sessionExerciseId",
      params: { sessionId, sessionExerciseId },
      replace: true,
    });
  }

  async function removeFromSession() {
    await command(
      "removeSessionExercise",
      { sessionExerciseId: log.sessionExerciseId },
      { undoLabel: t("session.log.removedExercise", { name: exercise.name }) },
    );
    await goBack({
      to: "/sessions/$sessionId",
      params: { sessionId: log.session.id },
    });
  }
  const removeItem = {
    label: t("session.log.removeFromSession"),
    icon: <Trash2 size={18} />,
    danger: true,
    onClick: () => void removeFromSession(),
  };

  const previous = log.previous[0];
  const earlier = log.previous.slice(1);

  const settingsLink = {
    to: "/exercises/$exerciseId",
    params: { exerciseId: exercise.id },
    search: {
      sessionId: log.session.id,
      sessionExerciseId: log.sessionExerciseId,
    },
  } as const;
  const historyLink = {
    ...settingsLink,
    to: "/exercises/$exerciseId/history",
  } as const;

  const iconLinkClass =
    "inline-flex size-10 items-center justify-center rounded-xl hover:bg-surface";
  const historyIcon = (
    <IconTip label={t("session.log.history")}>
      <Link
        {...historyLink}
        aria-label={t("session.log.history")}
        className={iconLinkClass}
      >
        <ChartLine size={20} />
      </Link>
    </IconTip>
  );
  const header = (
    <>
      {/* The name is what must be readable: it may wrap, and the rarer
          actions wait behind "⋯". */}
      <PageHeader
        title={exercise.name}
        wrap
        back={{
          to: "/sessions/$sessionId",
          params: { sessionId: log.session.id },
          label: t("session.log.backToSession"),
        }}
        className="lg:hidden"
        actions={
          <>
            {historyIcon}
            <MoreMenu
              label={t("session.log.moreActions")}
              items={[
                {
                  label: t("session.log.editExercise"),
                  icon: <Pencil size={18} />,
                  onClick: () => void navigate(settingsLink),
                },
                {
                  label: t("session.log.substitute"),
                  icon: <ArrowLeftRight size={18} />,
                  onClick: () => setSubstituting(true),
                },
                removeItem,
              ]}
            />
          </>
        }
      />
      <div className="hidden items-center gap-1 pt-6 lg:flex">
        <h1 className="flex-1 truncate text-2xl font-semibold">
          {exercise.name}
        </h1>
        {historyIcon}
        <IconTip label={t("session.log.editExercise")}>
          <Link
            {...settingsLink}
            aria-label={t("session.log.editExercise")}
            className={iconLinkClass}
          >
            <Pencil size={19} />
          </Link>
        </IconTip>
        <IconTip label={t("session.log.substituteExercise")}>
          <button
            type="button"
            aria-label={t("session.log.substituteExercise")}
            onClick={() => setSubstituting(true)}
            className={iconLinkClass}
          >
            <ArrowLeftRight size={20} />
          </button>
        </IconTip>
        <MoreMenu label={t("session.log.moreActions")} items={[removeItem]} />
      </div>
      {(log.slotNote || exercise.notes) && (
        <div className="flex flex-col gap-1 px-4 pb-3 text-ink-muted lg:px-0">
          {log.slotNote && <p className="font-medium">{log.slotNote}</p>}
          {exercise.notes && <p className="text-sm">{exercise.notes}</p>}
        </div>
      )}
    </>
  );

  return (
    <Screen
      header={header}
      scrollId="logging"
      width="logPane"
      footer={
        <div className="flex flex-col gap-3 px-4 py-3 lg:px-0">
          {editing ? (
            <div className="flex h-12 items-center gap-2">
              <p className="flex-1 font-semibold">
                {t("session.log.editingSet", { number: editIndex + 1 })}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(null)}
              >
                {t("common.cancel")}
              </Button>
            </div>
          ) : (
            <RestControls />
          )}
          <EntryFields
            type={exercise.type}
            entry={editing ? editing.entry : entry}
            onChange={(next) =>
              editing ? setEditing({ ...editing, entry: next }) : setEntry(next)
            }
            unit={unit}
            incrementKg={exercise.weightIncrementKg}
            settings={settings}
          />
          {editing ? (
            <div className="flex gap-2">
              <Button variant="danger" size="lg" onClick={deleteEdited}>
                {t("session.log.deleteSet")}
              </Button>
              <Button
                variant="primary"
                size="lg"
                className="flex-1"
                disabled={!editValues}
                onClick={saveEdit}
              >
                {t("session.log.saveSet", { number: editIndex + 1 })}
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              size="lg"
              disabled={!values}
              onClick={onLog}
            >
              {t("session.log.logSet", { number: log.sets.length + 1 })}
            </Button>
          )}
        </div>
      }
    >
      <div className="px-4 lg:px-0">
        {log.substitutesName && (
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setSubstituting(true)}
            className="-mx-2 mb-3 block max-w-[calc(100%+1rem)] rounded-lg px-2 py-1 text-left text-sm text-ink-muted hover:bg-surface hover:text-ink"
          >
            <Substitutes name={log.substitutesName} />
          </button>
        )}
        <Ledger
          log={log}
          unit={unit}
          editingId={editing?.setId ?? null}
          onEdit={toggleEdit}
          onStopEditing={() => setEditing(null)}
          onCopy={fillFrom}
        />
        {showNotes && (
          <NotesField
            label={t("session.log.notesLabel", { name: exercise.name })}
            value={log.notes}
            placeholder={t("session.log.notesPlaceholder")}
            focusOnMount={addingNote && log.notes === ""}
            onSave={(notes) =>
              command("updateSessionExerciseNotes", {
                sessionExerciseId: log.sessionExerciseId,
                notes,
              })
            }
            onBlur={(text) => {
              if (text !== "") return;
              // A press blurs the field before its click. Closing the field
              // then would move the buttons below it from under the pointer,
              // and the click would miss.
              const done = new AbortController();
              const close = () => {
                done.abort();
                if (!(document.activeElement instanceof HTMLTextAreaElement)) {
                  setAddingNote(false);
                }
              };
              const { signal } = done;
              document.addEventListener("click", close, { signal });
              document.addEventListener("keyup", close, { signal });
            }}
            className="mt-4"
          />
        )}
        <div className="mt-3 flex flex-wrap gap-x-5">
          {!showNotes && (
            <button
              type="button"
              onClick={() => setAddingNote(true)}
              className={quietButtonClass}
            >
              <NotebookPen size={17} />
              {t("session.log.addNote")}
            </button>
          )}
          {earlier.length > 0 && (
            <button
              type="button"
              onClick={() => setShowEarlier(!showEarlier)}
              aria-expanded={showEarlier}
              className={quietButtonClass}
            >
              <ChevronDown
                size={18}
                className={clsx(
                  "transition-transform",
                  showEarlier && "rotate-180",
                )}
              />
              {t("session.log.earlierSessions")}
            </button>
          )}
        </div>
        {showEarlier && (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-5 pt-2 pb-2 sm:grid-cols-3">
            {earlier.map((p) => (
              <EarlierPerformance
                key={p.sessionId}
                performance={p}
                log={log}
                unit={unit}
                onCopy={fillFrom}
              />
            ))}
          </ul>
        )}
        {!previous && log.sets.length === 0 && (
          <p className="pt-4 text-[0.9375rem] text-ink-muted">
            {t("session.log.firstTime")}
          </p>
        )}
      </div>

      <ExercisePicker
        open={substituting}
        onOpenChange={setSubstituting}
        title={t("session.log.insteadOf", { name: exercise.name })}
        substituteFor={{ exerciseId: exercise.id, slotId: log.slotId }}
        onPick={async (exerciseId) => {
          const id = await command("substituteExercise", {
            sessionExerciseId: log.sessionExerciseId,
            exerciseId,
          });
          if (id && id !== log.sessionExerciseId) {
            await navigate({
              to: "/sessions/$sessionId/$sessionExerciseId",
              params: { sessionId: log.session.id, sessionExerciseId: id },
              replace: true,
            });
          }
        }}
      />
      <Confirm
        open={ended !== null}
        onOpenChange={(open) => !open && setEnded(null)}
        title={t("session.log.endedTitle")}
        description={
          ended &&
          t(
            ended.reason === "idle"
              ? "session.log.endedIdle"
              : "session.log.endedManual",
            { time: formatTime(ended.endedAt, deviceTimeZone()) },
          )
        }
        actions={[
          {
            label: t("session.log.continueSession"),
            onClick: continueSession,
          },
          {
            label: t("session.log.startNewSession"),
            variant: "secondary",
            onClick: startNewSession,
          },
        ]}
      />
    </Screen>
  );
}
/**
 * Today's sets next to last time's, row by row. Set n is judged against set
 * n of the previous performance, so the pairing is the comparison.
 */
function Ledger(props: {
  log: ExerciseLog;
  unit: "kg" | "lb";
  /** The set being edited in the footer, highlighted here. */
  editingId: string | null;
  onEdit: (set: LoggedSet) => void;
  onStopEditing: () => void;
  onCopy: (set: LoggedSet) => void;
}) {
  const { log, unit } = props;
  const { t } = useTranslation();
  const previous = log.previous[0];
  const rows = Math.max(log.sets.length + 1, previous?.sets.length ?? 0);

  return (
    <table className="w-full table-fixed border-collapse">
      <thead>
        <tr className="text-left text-sm text-ink-muted">
          <th scope="col" className="w-8 pb-1 font-normal">
            <span className="sr-only">{t("session.ledger.set")}</span>
          </th>
          <th scope="col" className="pb-1 font-normal">
            {t("session.ledger.today")}
          </th>
          <th scope="col" className="pb-1 pl-3 font-normal">
            {previous
              ? formatSessionDate(previous.startedAt, previous.tz)
              : t("session.ledger.lastTime")}
          </th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, i) => {
          const today = log.sets[i];
          const before = previous?.sets[i];
          const isNext = i === log.sets.length;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are set numbers
            <tr key={i}>
              <td className="tabular py-1 text-sm text-ink-muted">{i + 1}</td>
              <td className="py-1">
                {today ? (
                  <div className="-ml-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => props.onEdit(today)}
                      aria-pressed={props.editingId === today.id}
                      aria-label={t("session.ledger.editSet", {
                        number: i + 1,
                        set: formatSet(today, log.exercise.type, unit),
                      })}
                      className="flex h-12 min-w-0 items-center rounded-xl px-2 text-left hover:bg-surface aria-pressed:bg-selected aria-pressed:ring-2 aria-pressed:ring-ink/50"
                    >
                      <span className="numerals truncate text-2xl">
                        {formatSet(today, log.exercise.type, unit)}
                      </span>
                    </button>
                    <Marker
                      marker={today.marker}
                      basis={today.markerBasis}
                      type={log.exercise.type}
                      unit={unit}
                    />
                  </div>
                ) : isNext && props.editingId ? (
                  <button
                    type="button"
                    onClick={props.onStopEditing}
                    aria-label={t("session.ledger.stopEditing")}
                    className="-ml-2 flex h-12 items-center rounded-xl px-2 text-2xl text-ink-muted hover:bg-surface hover:text-ink"
                  >
                    {t("session.ledger.next")}
                  </button>
                ) : (
                  <span className="flex h-12 items-center text-2xl text-ink-muted">
                    {isNext ? t("session.ledger.next") : ""}
                  </span>
                )}
              </td>
              <td className="py-1 pl-3">
                {before && (
                  <div className="-ml-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => props.onCopy(before)}
                      aria-label={t("session.ledger.useForNext", {
                        set: formatSet(before, log.exercise.type, unit),
                      })}
                      className="flex h-12 min-w-0 items-center rounded-xl px-2 text-left text-ink-muted hover:bg-surface hover:text-ink"
                    >
                      <span className="numerals truncate text-xl">
                        {formatSet(before, log.exercise.type, unit)}
                      </span>
                    </button>
                    <Marker
                      marker={before.marker}
                      basis={before.markerBasis}
                      type={log.exercise.type}
                      unit={unit}
                    />
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function EarlierPerformance(props: {
  performance: Performance;
  log: ExerciseLog;
  unit: "kg" | "lb";
  onCopy: (set: LoggedSet) => void;
}) {
  const { performance, log, unit } = props;
  const { t } = useTranslation();
  const date = formatSessionDate(performance.startedAt, performance.tz);
  // A small column like the "last time" one: numbered sets, one per row.
  return (
    <li className="min-w-0">
      <h2 className="pb-1 text-sm text-ink-muted">{date}</h2>
      <ol>
        {performance.sets.map((set, i) => {
          const text = formatSet(set, log.exercise.type, unit);
          return (
            <li key={set.id} className="-ml-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => props.onCopy(set)}
                aria-label={t("session.ledger.useSetFrom", {
                  number: i + 1,
                  set: text,
                  date,
                })}
                className="flex h-10 min-w-0 items-center gap-2 rounded-xl px-2 text-left text-ink-muted hover:bg-surface hover:text-ink"
              >
                <span className="tabular w-4 shrink-0 text-xs">{i + 1}</span>{" "}
                <span className="numerals truncate text-lg">{text}</span>
              </button>
              <Marker
                marker={set.marker}
                basis={set.markerBasis}
                type={log.exercise.type}
                unit={unit}
              />
            </li>
          );
        })}
      </ol>
    </li>
  );
}
