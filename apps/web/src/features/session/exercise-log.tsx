import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  type EffectiveEnd,
  type ExerciseLog,
  effectiveSessionEnd,
  type LoggedSet,
  type Performance,
  type SetValues,
} from "@workout-logger/core";
import { clsx } from "clsx";
import { ArrowLeftRight, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button, IconButton } from "../../components/button.tsx";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { Confirm } from "../../components/sheet.tsx";
import { useCommand, useDbQuery } from "../../db/react.tsx";
import {
  formatSessionDate,
  formatSet,
  formatTime,
  setUnit,
} from "../../lib/format.ts";
import { restTimer } from "../../lib/rest-timer.ts";
import { ExercisePicker } from "../exercises/picker.tsx";
import { type Entry, entryFromSet, setFromEntry } from "./entry.ts";
import { EditSetSheet, EntryFields } from "./entry-fields.tsx";
import { Marker } from "./marker.tsx";
import { RestControls } from "./rest-bar.tsx";

const route = getRouteApi("/sessions/$sessionId/$sessionExerciseId");

export function ExerciseLogPage() {
  const { sessionId, sessionExerciseId } = route.useParams();
  const log = useDbQuery("exerciseLog", { sessionExerciseId });
  if (!log) {
    return (
      <Screen
        header={
          <PageHeader
            title="Exercise"
            back={{
              to: "/sessions/$sessionId",
              params: { sessionId },
              label: "Back to session",
            }}
          />
        }
        scrollId="exercise-removed"
        width="narrow"
      >
        <Empty>This exercise was removed from the session.</Empty>
      </Screen>
    );
  }
  return <Logger key={log.sessionExerciseId} log={log} />;
}

function Logger({ log }: { log: ExerciseLog }) {
  const settings = useDbQuery("settings");
  const unit = settings.weight_unit;
  const command = useCommand();
  const navigate = useNavigate();
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

  const [editing, setEditing] = useState<LoggedSet | null>(null);
  const [substituting, setSubstituting] = useState(false);
  const [ended, setEnded] = useState<Extract<
    EffectiveEnd,
    { running: false }
  > | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);
  const values = setFromEntry(entry, exercise.type, unit);

  async function logInto(sessionExerciseId: string, set: SetValues) {
    const id = await command("logSet", { sessionExerciseId, values: set });
    if (id) restTimer.start(log.restSeconds);
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
    if (end.running) void logInto(log.sessionExerciseId, values);
    else setEnded(end);
  }

  async function continueSession() {
    if (!values) return;
    if (log.session.endedAt !== null) {
      await command("resumeSession", { sessionId: log.session.id });
    }
    await logInto(log.sessionExerciseId, values);
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
    await logInto(sessionExerciseId, values);
    await navigate({
      to: "/sessions/$sessionId/$sessionExerciseId",
      params: { sessionId, sessionExerciseId },
    });
  }

  const previous = log.previous[0];
  const earlier = log.previous.slice(1);

  const header = (
    <>
      <PageHeader
        title={exercise.name}
        back={{
          to: "/sessions/$sessionId",
          params: { sessionId: log.session.id },
          label: "Back to session",
        }}
        className="lg:hidden"
        actions={
          <IconButton
            label="Substitute exercise"
            onClick={() => setSubstituting(true)}
          >
            <ArrowLeftRight size={20} />
          </IconButton>
        }
      />
      <div className="hidden items-center gap-2 pt-6 lg:flex">
        <h1 className="flex-1 truncate text-2xl font-semibold">
          {exercise.name}
        </h1>
        <Button size="sm" variant="ghost" onClick={() => setSubstituting(true)}>
          <ArrowLeftRight size={17} />
          Substitute
        </Button>
      </div>
      {exercise.notes && (
        <p className="px-4 pb-1 text-sm text-ink-muted lg:px-0">
          {exercise.notes}
        </p>
      )}
    </>
  );

  return (
    <Screen
      header={header}
      scrollId="logging"
      width="narrow"
      footer={
        <div className="flex flex-col gap-3 px-4 py-3 lg:px-0">
          <RestControls />
          <EntryFields
            type={exercise.type}
            entry={entry}
            onChange={setEntry}
            unit={unit}
            incrementKg={exercise.weightIncrementKg}
            settings={settings}
          />
          <Button
            variant="primary"
            size="lg"
            disabled={!values}
            onClick={onLog}
          >
            Log set {log.sets.length + 1}
          </Button>
        </div>
      }
    >
      <div className="px-4 pt-2 pb-4 lg:px-0">
        <Ledger
          log={log}
          unit={unit}
          onEdit={setEditing}
          onCopy={(set) => setEntry(entryFromSet(set, unit))}
        />
        {earlier.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowEarlier(!showEarlier)}
              aria-expanded={showEarlier}
              className="flex h-10 items-center gap-1 text-[0.9375rem] font-medium text-ink-muted hover:text-ink"
            >
              <ChevronDown
                size={18}
                className={clsx(
                  "transition-transform",
                  showEarlier && "rotate-180",
                )}
              />
              Earlier sessions
            </button>
            {showEarlier && (
              <ul className="flex flex-col gap-3 pt-1 pb-2">
                {earlier.map((p) => (
                  <EarlierPerformance
                    key={p.sessionId}
                    performance={p}
                    log={log}
                    unit={unit}
                    onCopy={(set) => setEntry(entryFromSet(set, unit))}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
        {!previous && log.sets.length === 0 && (
          <p className="pt-4 text-[0.9375rem] text-ink-muted">
            First time logging this exercise.
          </p>
        )}
      </div>

      <EditSetSheet
        set={editing}
        onClose={() => setEditing(null)}
        type={exercise.type}
        unit={unit}
        incrementKg={exercise.weightIncrementKg}
        settings={settings}
      />
      <ExercisePicker
        open={substituting}
        onOpenChange={setSubstituting}
        title={`Instead of ${exercise.name}`}
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
            });
          }
        }}
      />
      <Confirm
        open={ended !== null}
        onOpenChange={(open) => !open && setEnded(null)}
        title="This session has ended"
        description={
          ended &&
          `It ${ended.reason === "idle" ? "went idle" : "ended"} at ${formatTime(ended.endedAt, Intl.DateTimeFormat().resolvedOptions().timeZone)}. Log this set into it, or start a new session?`
        }
        actions={[
          { label: "Continue that session", onClick: continueSession },
          {
            label: "Start a new session",
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
  onEdit: (set: LoggedSet) => void;
  onCopy: (set: LoggedSet) => void;
}) {
  const { log, unit } = props;
  const previous = log.previous[0];
  const rows = Math.max(log.sets.length + 1, previous?.sets.length ?? 0);
  const suffix = setUnit(log.exercise.type, unit);

  return (
    <table className="w-full table-fixed border-collapse">
      <thead>
        <tr className="text-left text-sm text-ink-muted">
          <th scope="col" className="w-8 pb-1 font-normal">
            <span className="sr-only">Set</span>
          </th>
          <th scope="col" className="pb-1 font-normal">
            Today
          </th>
          <th scope="col" className="pb-1 pl-3 font-normal">
            {previous
              ? formatSessionDate(previous.startedAt, previous.tz)
              : "Last time"}
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
                  <button
                    type="button"
                    onClick={() => props.onEdit(today)}
                    className="-ml-2 flex h-12 w-[calc(100%+0.5rem)] items-center gap-2 rounded-lg px-2 text-left hover:bg-surface"
                  >
                    <span className="sr-only">Edit set {i + 1}: </span>
                    <span className="numerals truncate text-2xl">
                      {formatSet(today, log.exercise.type, unit)}
                    </span>
                    <Marker marker={today.marker} />
                  </button>
                ) : (
                  <span className="flex h-12 items-center text-ink-muted">
                    {isNext ? "next" : ""}
                  </span>
                )}
              </td>
              <td className="py-1 pl-3">
                {before && (
                  <button
                    type="button"
                    onClick={() => props.onCopy(before)}
                    aria-label={`Use ${formatSet(before, log.exercise.type, unit)} for the next set`}
                    className="-ml-2 flex h-12 w-[calc(100%+0.5rem)] items-center gap-2 rounded-lg px-2 text-left text-ink-muted hover:bg-surface hover:text-ink"
                  >
                    <span className="numerals truncate text-xl">
                      {formatSet(before, log.exercise.type, unit)}
                    </span>
                    <Marker marker={before.marker} />
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
      {suffix && (
        <caption className="caption-bottom pt-1 text-left text-xs text-ink-muted">
          Weights in {suffix}. Tap last time's set to use it.
        </caption>
      )}
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
  return (
    <li>
      <p className="text-sm text-ink-muted">
        {formatSessionDate(performance.startedAt, performance.tz)}
      </p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {performance.sets.map((set) => (
          <button
            key={set.id}
            type="button"
            onClick={() => props.onCopy(set)}
            className="flex h-9 items-center gap-1 rounded-lg bg-surface px-2.5 hover:bg-rule"
          >
            <span className="numerals text-lg">
              {formatSet(set, log.exercise.type, unit)}
            </span>
            <Marker marker={set.marker} />
          </button>
        ))}
      </div>
    </li>
  );
}
