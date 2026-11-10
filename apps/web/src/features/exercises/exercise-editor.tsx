import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
  type ExerciseDetail,
  type ExerciseType,
  fromKg,
  roundTo,
  toKg,
} from "@workout-logger/core";
import { MUSCLE_GROUPS } from "@workout-logger/exercises";
import { clsx } from "clsx";
import { Copy } from "lucide-react";
import { useState } from "react";
import { Button, buttonClass } from "../../components/button.tsx";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { Segmented } from "../../components/segmented.tsx";
import { parseDuration, parseNumber } from "../../components/stepper.tsx";
import { useCommand, useDbQuery } from "../../db/react.tsx";
import { EXERCISE_TYPE_LABELS, formatDuration } from "../../lib/format.ts";

const route = getRouteApi("/exercises/$exerciseId");

/** Where the editor returns to: the exercise list, or the logging screen it was opened from. */
type Back =
  | { to: "/exercises"; label: string }
  | {
      to: "/sessions/$sessionId/$sessionExerciseId";
      params: { sessionId: string; sessionExerciseId: string };
      label: string;
    };

const TO_EXERCISES: Back = { to: "/exercises", label: "Back to exercises" };

export function EditExercisePage() {
  const { exerciseId } = route.useParams();
  const search = route.useSearch();
  const back: Back =
    "sessionId" in search
      ? {
          to: "/sessions/$sessionId/$sessionExerciseId",
          params: search,
          label: "Back to logging",
        }
      : TO_EXERCISES;
  const exercise = useDbQuery("exerciseDetail", { exerciseId });
  if (!exercise) {
    return (
      <Screen
        header={<PageHeader title="Exercise" back={back} />}
        scrollId="exercise-deleted"
      >
        <Empty>This exercise was deleted.</Empty>
      </Screen>
    );
  }
  return <ExerciseForm key={exercise.id} exercise={exercise} back={back} />;
}

const newRoute = getRouteApi("/exercises/new");

export function NewExercisePage() {
  const { from } = newRoute.useSearch();
  if (from) return <CopyExercise key={from} from={from} />;
  return <ExerciseForm exercise={null} back={TO_EXERCISES} />;
}

/** A new exercise prefilled from an existing one; nothing is saved until Create. */
function CopyExercise({ from }: { from: string }) {
  const source = useDbQuery("exerciseDetail", { exerciseId: from });
  return (
    <ExerciseForm
      exercise={null}
      initial={source && { ...source, name: `${source.name} (copy)` }}
      back={TO_EXERCISES}
    />
  );
}

/** No option chosen means the exercise doesn't target the muscle. */
const FACTOR_OPTIONS = [
  { value: "0.5", label: "Secondary" },
  { value: "1", label: "Primary" },
] as const;

type FactorValue = (typeof FACTOR_OPTIONS)[number]["value"];

function factorValue(factor: number | undefined): FactorValue | null {
  return factor === 1 ? "1" : factor === 0.5 ? "0.5" : null;
}

function ExerciseForm({
  exercise,
  initial,
  back,
}: {
  /** The exercise being edited; null creates a new one. */
  exercise: ExerciseDetail | null;
  /** Starting values for a new exercise, e.g. a copy. */
  initial?: ExerciseDetail | null;
  back: Back;
}) {
  const start = exercise ?? initial ?? null;
  const muscles = useDbQuery("muscles");
  const settings = useDbQuery("settings");
  const unit = settings.weight_unit;
  const command = useCommand();
  const navigate = useNavigate();
  const goBack = () =>
    back.to === "/exercises"
      ? navigate({ to: back.to })
      : navigate({ to: back.to, params: back.params });

  const [name, setName] = useState(start?.name ?? "");
  const [type, setType] = useState<ExerciseType>(start?.type ?? "weight_reps");
  const [targets, setTargets] = useState<Record<string, number>>(
    start?.muscles ?? {},
  );
  const [rest, setRest] = useState(
    start?.defaultRestS == null ? "" : formatDuration(start.defaultRestS),
  );
  const [increment, setIncrement] = useState(
    start?.weightIncrementKg == null
      ? ""
      : String(roundTo(fromKg(start.weightIncrementKg, unit), 3)),
  );
  const [notes, setNotes] = useState(start?.notes ?? "");

  const hasPrimary = Object.values(targets).includes(1);
  const restS = rest.trim() ? parseDuration(rest) : null;
  const incrementValue = increment.trim() ? parseNumber(increment) : null;
  const invalid =
    !name.trim() ||
    !hasPrimary ||
    (rest.trim() !== "" && restS === null) ||
    (increment.trim() !== "" && !incrementValue);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;
    const fields = {
      name: name.trim(),
      type,
      defaultRestS: restS,
      weightIncrementKg: incrementValue ? toKg(incrementValue, unit) : null,
      notes: notes.trim(),
      muscles: Object.fromEntries(
        Object.entries(targets).filter(([, f]) => f > 0),
      ),
    };
    if (exercise) {
      await command("updateExercise", { exerciseId: exercise.id, ...fields });
      await goBack();
    } else if (await command("createExercise", fields)) {
      await goBack();
    }
  }

  return (
    <Screen
      scrollId="exercise"
      width="medium"
      header={
        <PageHeader
          title={
            exercise
              ? "Edit exercise"
              : initial
                ? "Copy exercise"
                : "New exercise"
          }
          subtitle={
            exercise?.builtin
              ? "Built in. Your changes are kept over catalog updates."
              : undefined
          }
          back={back}
        />
      }
    >
      <form onSubmit={save} className="pb-8">
        <div className="flex flex-col gap-5 px-4 lg:px-0">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Row (Chest Supported)"
              className={inputClass}
            />
          </Field>

          <fieldset>
            <legend className="pb-1.5 text-sm font-medium">
              What a set records
            </legend>
            <div className="flex flex-col gap-1">
              {(Object.keys(EXERCISE_TYPE_LABELS) as ExerciseType[]).map(
                (t) => (
                  <label
                    key={t}
                    className="flex h-10 items-center gap-3 rounded-lg px-2 hover:bg-surface"
                  >
                    <input
                      type="radio"
                      name="type"
                      checked={type === t}
                      onChange={() => setType(t)}
                      className="size-4 accent-[var(--ink)]"
                    />
                    {EXERCISE_TYPE_LABELS[t]}
                  </label>
                ),
              )}
            </div>
          </fieldset>

          <fieldset>
            <legend className="pb-1.5 text-sm font-medium">Muscles</legend>
            <p
              className={clsx(
                "pb-2 text-sm",
                hasPrimary ? "text-ink-muted" : "text-danger",
              )}
            >
              Pick at least one primary muscle.
            </p>
            <div className="gap-x-8 sm:columns-2">
              {MUSCLE_GROUPS.map((group) => (
                <div key={group} className="break-inside-avoid pb-3">
                  <h2 className="pb-1 text-sm text-ink-muted">{group}</h2>
                  {muscles
                    .filter((m) => m.group === group)
                    .map((muscle) => (
                      <div
                        key={muscle.id}
                        className="flex h-10 items-center gap-2"
                      >
                        <span className="flex-1">{muscle.name}</span>
                        <Segmented
                          label={muscle.name}
                          size="sm"
                          deselectable
                          value={factorValue(targets[muscle.id])}
                          options={FACTOR_OPTIONS}
                          onChange={(value) =>
                            setTargets({
                              ...targets,
                              [muscle.id]: value === null ? 0 : Number(value),
                            })
                          }
                        />
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Rest time" hint="m:ss. Empty uses your default.">
              <input
                value={rest}
                onChange={(e) => setRest(e.target.value)}
                inputMode="numeric"
                placeholder={formatDuration(settings.rest_default_s)}
                className={inputClass}
              />
            </Field>
            <Field
              label={`Weight step (${unit})`}
              hint="Empty uses your default."
            >
              <input
                value={increment}
                onChange={(e) => setIncrement(e.target.value)}
                inputMode="decimal"
                placeholder={String(
                  unit === "kg"
                    ? settings.weight_increment_kg
                    : settings.weight_increment_lb,
                )}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Seat height, grip, cues"
              className={clsx(inputClass, "h-auto py-2")}
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="primary"
              className="w-full sm:w-auto"
              disabled={invalid}
            >
              {exercise ? "Save exercise" : "Create exercise"}
            </Button>
            {exercise && (
              <Button
                onClick={async () => {
                  await command("updateExercise", {
                    exerciseId: exercise.id,
                    archived: !exercise.archived,
                  });
                  await goBack();
                }}
              >
                {exercise.archived ? "Unarchive" : "Archive"}
              </Button>
            )}
            {exercise && (
              <Link
                to="/exercises/new"
                search={{ from: exercise.id }}
                className={buttonClass()}
              >
                <Copy size={16} />
                Copy as new
              </Link>
            )}
          </div>
        </div>
      </form>
    </Screen>
  );
}

const inputClass =
  "h-11 w-full rounded-lg bg-raised px-3 outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink";

function Field(props: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{props.label}</span>
      {props.children}
      {props.hint && (
        <span className="text-sm text-ink-muted">{props.hint}</span>
      )}
    </label>
  );
}
