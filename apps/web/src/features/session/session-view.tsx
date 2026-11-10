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
import { Check, ListOrdered, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/button.tsx";
import { listClass, rowClass } from "../../components/list.ts";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { Confirm } from "../../components/sheet.tsx";
import { GripHandle, SortableList } from "../../components/sortable.tsx";
import { useCommand, useDbQuery } from "../../db/react.tsx";
import {
  deviceTimeZone,
  formatDuration,
  formatSessionDate,
  formatSessionLength,
  formatSet,
  formatTime,
  todayIso,
} from "../../lib/format.ts";
import { useNow } from "../../lib/use-now.ts";
import { ExercisePicker } from "../exercises/picker.tsx";

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
        <SessionPanel key={view.session.id} view={view} />
      </div>
      <div className={clsx("h-full", !logging && "hidden lg:block")}>
        <Outlet />
      </div>
    </div>
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

function SessionPanel({ view }: { view: SessionView }) {
  const { session } = view;
  const settings = useDbQuery("settings");
  const command = useCommand();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
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
  // Today's sessions stay editable: an idle end may only be a long rest.
  const readOnly =
    !editing &&
    ended &&
    localDate(session.startedAt, deviceTimeZone()) !== todayIso();
  const unit = settings.weight_unit as WeightUnit;

  return (
    <Screen
      scrollId="session"
      width="pane"
      header={
        <PageHeader
          title={session.dayName ?? "Ad hoc session"}
          subtitle={[
            formatSessionDate(session.startedAt, session.tz),
            session.routineName,
          ]
            .filter(Boolean)
            .join(", ")}
          back={{ to: "/", label: "Back to today" }}
          actions={
            readOnly ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
              >
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
                  {exercise.sets.length > 0 && (
                    <p className="truncate text-sm text-ink-muted tabular">
                      {exercise.sets
                        .map((s) =>
                          formatSet(
                            s,
                            exercise.type,
                            settings.weight_unit as WeightUnit,
                          ),
                        )
                        .join(", ")}
                    </p>
                  )}
                </div>
              </Link>
              <GripHandle handle={handle} />
            </div>
          )}
        />
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
  return (
    <ul className={listClass}>
      {view.exercises.map((exercise) => (
        <li key={exercise.id}>
          <Link
            to="/exercises/$exerciseId/history"
            params={{ exerciseId: exercise.exerciseId }}
            className={`${rowClass} block py-2.5`}
          >
            <p className="font-medium">
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
              <ol className="flex flex-wrap gap-x-3">
                {exercise.sets.map((set, i) => (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: sets in order, read only
                    key={i}
                    className="numerals text-lg"
                  >
                    {formatSet(set, exercise.type, unit)}
                  </li>
                ))}
              </ol>
            )}
          </Link>
        </li>
      ))}
    </ul>
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
