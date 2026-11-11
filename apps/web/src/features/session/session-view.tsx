import {
  getRouteApi,
  Link,
  Outlet,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router";
import {
  effectiveSessionEnd,
  localDate,
  type SessionView,
  type WeightUnit,
} from "@workout-logger/core";
import { clsx } from "clsx";
import { Check, ChevronRight, ListOrdered, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/button.tsx";
import { listClass, rowClass } from "../../components/list.ts";
import { NotesField } from "../../components/notes-field.tsx";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { Confirm } from "../../components/sheet.tsx";
import { GripHandle, SortableList } from "../../components/sortable.tsx";
import { useCommand, useDbQuery } from "../../db/react.tsx";
import {
  deviceTimeZone,
  formatDuration,
  formatSessionDate,
  formatSessionLength,
  formatTime,
  todayIso,
} from "../../lib/format.ts";
import { useNow } from "../../lib/use-now.ts";
import { ExercisePicker } from "../exercises/picker.tsx";
import { SetLine } from "./set-line.tsx";

const route = getRouteApi("/sessions/$sessionId");

export function SessionLayout() {
  const { sessionId } = route.useParams();
  const view = useDbQuery("sessionView", { sessionId });
  const matchRoute = useMatchRoute();
  const logging = Boolean(
    matchRoute({ to: "/sessions/$sessionId/$sessionExerciseId" }),
  );

  if (!view) {
    return (
      <Screen
        header={
          <PageHeader
            title="Session"
            back={{ to: "/", label: "Back to today" }}
          />
        }
        scrollId="session-deleted"
      >
        <Empty>This session was deleted.</Empty>
      </Screen>
    );
  }
  return <SessionPanes key={view.session.id} view={view} logging={logging} />;
}

function SessionPanes(props: { view: SessionView; logging: boolean }) {
  const { view, logging } = props;
  const [editing, setEditing] = useState(false);
  const readOnly = useReadOnly(view, editing) && !logging;
  // A past session is a page of its own: there is nothing to log beside it.
  if (readOnly) {
    return (
      <SessionPanel view={view} readOnly onEdit={() => setEditing(true)} />
    );
  }
  // Wide screens: the list and the logging pane side by side, each scrolling
  // on its own.
  return (
    <div className="h-full lg:grid lg:grid-cols-[24rem_minmax(0,1fr)]">
      <div
        className={clsx(
          "h-full lg:border-r lg:border-rule",
          logging && "hidden lg:block",
        )}
      >
        <SessionPanel view={view} readOnly={false} />
      </div>
      <div className={clsx("h-full", !logging && "hidden lg:block")}>
        <Outlet />
      </div>
    </div>
  );
}

/**
 * Whether the session opens read-only: it has ended, on an earlier day.
 * Today's sessions stay editable, since an idle end may only be a long rest.
 */
function useReadOnly(view: SessionView, editing: boolean): boolean {
  const { session } = view;
  const settings = useDbQuery("settings");
  const now = useNow();
  const ended = !effectiveSessionEnd(
    {
      started_at: session.startedAt,
      ended_at: session.endedAt,
      end_reason: session.endReason,
    },
    session.lastSetAt,
    now,
    settings.idle_threshold_s * 1000,
  ).running;
  return (
    !editing &&
    ended &&
    localDate(session.startedAt, deviceTimeZone()) !== todayIso()
  );
}

/** The right-hand pane on wide screens before an exercise is picked. */
export function SessionIndex() {
  return (
    <p className="hidden pt-32 text-center text-ink-muted lg:block">
      Pick an exercise to log its sets.
    </p>
  );
}

function SessionPanel(props: {
  view: SessionView;
  readOnly: boolean;
  onEdit?: () => void;
}) {
  const { view, readOnly } = props;
  const { session } = view;
  const settings = useDbQuery("settings");
  const command = useCommand();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const unit = settings.weight_unit as WeightUnit;
  const search = route.useSearch();
  const date = localDate(session.startedAt, session.tz);
  const back = search.exerciseId
    ? {
        to: "/exercises/$exerciseId/history" as const,
        params: { exerciseId: search.exerciseId },
        label: "Back to exercise",
      }
    : search.from === "calendar"
      ? {
          to: "/history" as const,
          search: { month: date.slice(0, 7), day: date },
          label: "Back to history",
        }
      : { to: "/" as const, label: "Back to today" };

  return (
    <Screen
      scrollId="session"
      width={readOnly ? "narrow" : "pane"}
      header={
        <PageHeader
          title={session.dayName ?? "Ad hoc session"}
          subtitle={[
            formatSessionDate(session.startedAt, session.tz),
            session.routineName,
          ]
            .filter(Boolean)
            .join(", ")}
          back={back}
          actions={
            readOnly ? (
              <Button variant="ghost" size="sm" onClick={props.onEdit}>
                <Pencil size={16} />
                Edit
              </Button>
            ) : (
              session.routineId && (
                <Link
                  to="/routines/$routineId"
                  params={{ routineId: session.routineId }}
                  search={{
                    sessionId: session.id,
                    ...(session.dayId && { dayId: session.dayId }),
                  }}
                  aria-label="Edit routine"
                  title="Edit routine"
                  className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-surface"
                >
                  <ListOrdered size={20} />
                </Link>
              )
            )
          }
        >
          <SessionTimer
            view={view}
            idleThresholdS={settings.idle_threshold_s}
            showElapsed={settings.session_timer_shown}
            readOnly={readOnly}
          />
        </PageHeader>
      }
    >
      {readOnly ? (
        <ReadOnlyExercises view={view} unit={unit} />
      ) : view.exercises.length === 0 ? (
        <Empty>Add the exercises you're doing.</Empty>
      ) : (
        <SortableList
          items={view.exercises}
          className={listClass}
          handleLabel={(exercise) => `Move ${exercise.name}`}
          onMove={(sessionExerciseId, toIndex) =>
            command("moveSessionExercise", { sessionExerciseId, toIndex })
          }
          render={(exercise, _index, handle) => (
            <div className="flex items-center">
              <Link
                to="/sessions/$sessionId/$sessionExerciseId"
                params={{
                  sessionId: session.id,
                  sessionExerciseId: exercise.id,
                }}
                className={`${rowClass} flex min-w-0 flex-1 items-center gap-3 py-3 data-[status=active]:bg-surface`}
              >
                <DoneMark done={exercise.sets.length > 0} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{exercise.name}</p>
                  {exercise.substitutesName && (
                    <p className="truncate text-sm text-ink-muted">
                      for {exercise.substitutesName}
                    </p>
                  )}
                  {exercise.notes && (
                    <p className="truncate text-sm text-ink-muted">
                      {exercise.notes}
                    </p>
                  )}
                  {exercise.sets.length > 0 && (
                    <div className="pt-0.5">
                      <SetLine
                        sets={exercise.sets}
                        type={exercise.type}
                        unit={unit}
                      />
                    </div>
                  )}
                </div>
              </Link>
              <GripHandle handle={handle} />
            </div>
          )}
        />
      )}

      {readOnly ? (
        session.notes && (
          <p className="whitespace-pre-wrap px-4 pt-4 text-[0.9375rem] lg:px-0">
            {session.notes}
          </p>
        )
      ) : (
        <div className="px-4 pt-4 lg:px-0">
          <NotesField
            label="Session notes"
            value={session.notes}
            placeholder="Notes on this session"
            onSave={(notes) =>
              command("updateSessionNotes", { sessionId: session.id, notes })
            }
          />
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-col items-start gap-2 px-4 pt-4 lg:px-0">
          <Button className="w-full" onClick={() => setAdding(true)}>
            <Plus size={18} />
            Add exercise
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="mt-4"
            onClick={() => setConfirmDelete(true)}
          >
            Delete session
          </Button>
        </div>
      )}
      <ExercisePicker
        open={adding}
        onOpenChange={setAdding}
        title="Add exercise"
        onPick={async (exerciseId) => {
          const id = await command("addSessionExercise", {
            sessionId: session.id,
            exerciseId,
          });
          if (id) {
            await navigate({
              to: "/sessions/$sessionId/$sessionExerciseId",
              params: { sessionId: session.id, sessionExerciseId: id },
            });
          }
        }}
      />
      <Confirm
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this session?"
        description={`${session.setCount} logged ${session.setCount === 1 ? "set goes" : "sets go"} with it.`}
        actions={[
          {
            label: "Delete session",
            variant: "danger",
            onClick: async () => {
              await command(
                "deleteSession",
                { sessionId: session.id },
                { undoLabel: "Session deleted" },
              );
              await navigate({ to: "/" });
            },
          },
        ]}
      />
    </Screen>
  );
}

/** A past session's sets; each exercise opens its history. */
function ReadOnlyExercises(props: { view: SessionView; unit: WeightUnit }) {
  const { view, unit } = props;
  if (view.exercises.length === 0) return <Empty>No exercises.</Empty>;
  const weighted = view.exercises.some(
    (e) => e.type === "weight_reps" || e.type === "bodyweight_reps",
  );
  return (
    <>
      <ul className={listClass}>
        {view.exercises.map((exercise) => (
          <li key={exercise.id}>
            <Link
              to="/exercises/$exerciseId/history"
              params={{ exerciseId: exercise.exerciseId }}
              search={{ sessionId: view.session.id }}
              className={`${rowClass} flex items-center gap-3 py-3`}
            >
              <div className="min-w-0 flex-1">
                <p className="pb-1 font-medium">
                  {exercise.name}
                  {exercise.substitutesName && (
                    <span className="font-normal text-ink-muted">
                      {" "}
                      for {exercise.substitutesName}
                    </span>
                  )}
                </p>
                {exercise.sets.length === 0 ? (
                  <p className="text-sm text-ink-muted">No sets</p>
                ) : (
                  <SetLine
                    sets={exercise.sets}
                    type={exercise.type}
                    unit={unit}
                  />
                )}
                {exercise.notes && (
                  <p className="whitespace-pre-wrap pt-1 text-sm text-ink-muted">
                    {exercise.notes}
                  </p>
                )}
              </div>
              <ChevronRight size={18} className="shrink-0 text-ink-muted" />
            </Link>
          </li>
        ))}
      </ul>
      {weighted && (
        <p className="px-4 pt-2 text-xs text-ink-muted lg:px-0">
          Weights in {unit}.
        </p>
      )}
    </>
  );
}

function DoneMark({ done }: { done: boolean }) {
  return done ? (
    <span
      role="img"
      aria-label="Done"
      className="flex size-6 shrink-0 items-center justify-center rounded-full text-ink ring-2 ring-ink/60 ring-inset"
    >
      <Check size={15} strokeWidth={3} />
    </span>
  ) : (
    <span
      role="img"
      aria-label="Not started"
      className="size-6 shrink-0 rounded-full ring-2 ring-rule ring-inset"
    />
  );
}

function SessionTimer(props: {
  view: SessionView;
  idleThresholdS: number;
  showElapsed: boolean;
  /** A past session being viewed: a quiet summary, nothing to press. */
  readOnly: boolean;
}) {
  const { session } = props.view;
  const command = useCommand();
  const now = useNow();
  const end = effectiveSessionEnd(
    {
      started_at: session.startedAt,
      ended_at: session.endedAt,
      end_reason: session.endReason,
    },
    session.lastSetAt,
    now,
    props.idleThresholdS * 1000,
  );

  if (end.running) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-surface py-2 pr-2 pl-4">
        {props.showElapsed ? (
          <p className="flex-1">
            <span className="numerals text-3xl">
              {formatDuration((now - session.startedAt) / 1000)}
            </span>
          </p>
        ) : (
          <p className="flex-1 text-[0.9375rem] text-ink-muted">
            Running since {formatTime(session.startedAt, session.tz)}
          </p>
        )}
        <Button
          variant="primary"
          onClick={() => command("endSession", { sessionId: session.id })}
        >
          End session
        </Button>
      </div>
    );
  }
  if (props.readOnly) {
    const sets = `${session.setCount} ${session.setCount === 1 ? "set" : "sets"}`;
    return (
      <p className="text-[0.9375rem] text-ink-muted">
        {end.reason === "unknown"
          ? `${sets}, duration not recorded`
          : `${formatTime(session.startedAt, session.tz)}–${formatTime(end.endedAt, session.tz)} · ${formatSessionLength(end.endedAt - session.startedAt)} · ${sets}`}
      </p>
    );
  }
  const ended =
    end.reason === "unknown"
      ? "Duration not recorded"
      : `Lasted ${formatSessionLength(end.endedAt - session.startedAt)}, ${end.reason === "idle" ? "no sets since" : "ended at"} ${formatTime(end.endedAt, session.tz)}`;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface py-2 pr-2 pl-4">
      <p className="flex-1 text-[0.9375rem] text-ink-muted">{ended}</p>
      {end.reason === "manual" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => command("resumeSession", { sessionId: session.id })}
        >
          Resume
        </Button>
      )}
    </div>
  );
}
