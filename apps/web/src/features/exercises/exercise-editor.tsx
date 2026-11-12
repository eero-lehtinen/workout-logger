import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  type ExerciseDetail,
  type ExerciseType,
  fromKg,
  type MuscleItem,
  roundTo,
  toKg,
} from "@workout-logger/core";
import { MUSCLE_GROUPS } from "@workout-logger/exercises";
import { clsx } from "clsx";
import { Archive, ArchiveRestore, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/button.tsx";
import { chipClass } from "../../components/chip.tsx";
import { FieldLabel, fieldLabelClass } from "../../components/headings.tsx";
import { MoreMenu } from "../../components/more-menu.tsx";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { parseDuration, parseNumber } from "../../components/stepper.tsx";
import { useCommand, useDbQuery } from "../../db/react.tsx";
import { EXERCISE_TYPE_LABELS, formatDuration } from "../../lib/format.ts";
import { useGoBack } from "../../lib/navigation.ts";
import { backToOrigin, type Origin, originOf } from "./origin.ts";

const route = getRouteApi("/exercises/$exerciseId");

/**
 * Where the editor returns to: the exercise list, the exercise's history, or
 * the logging screen it was opened from.
 */
type Back =
  | { to: "/exercises"; label: string }
  | {
      to: "/exercises/$exerciseId/history";
      params: { exerciseId: string };
      search: Origin;
      label: string;
    }
  | {
      to: "/sessions/$sessionId/$sessionExerciseId";
      params: { sessionId: string; sessionExerciseId: string };
      label: string;
    };

const TO_EXERCISES: Back = { to: "/exercises", label: "Back to exercises" };

export function EditExercisePage() {
  const { exerciseId } = route.useParams();
  const search = route.useSearch();
  const origin = backToOrigin(search);
  const back: Back =
    search.from !== "history" &&
    origin.to === "/sessions/$sessionId/$sessionExerciseId"
      ? origin
      : {
          to: "/exercises/$exerciseId/history",
          params: { exerciseId },
          search: originOf(search),
          label: "Back to history",
        };
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

const FORM_ID = "exercise-form";

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
  const returnTo = useGoBack();
  const goBack = () => returnTo(back);

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
  // Problems show once a save was tried, not while the form is being filled.
  const [attempted, setAttempted] = useState(false);

  const hasPrimary = Object.values(targets).includes(1);
  const restS = rest.trim() ? parseDuration(rest) : null;
  const incrementValue = increment.trim() ? parseNumber(increment) : null;
  const problems = {
    name: !name.trim(),
    primary: !hasPrimary,
    rest: rest.trim() !== "" && restS === null,
    increment: increment.trim() !== "" && !incrementValue,
  };
  const invalid = Object.values(problems).some(Boolean);
  const shown = (problem: boolean) => attempted && problem;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
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

  async function toggleArchived() {
    if (!exercise) return;
    await command("updateExercise", {
      exerciseId: exercise.id,
      archived: !exercise.archived,
    });
    await goBack();
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
          back={back}
          actions={
            exercise && (
              <MoreMenu
                label="More actions"
                items={[
                  {
                    label: exercise.archived ? "Unarchive" : "Archive",
                    icon: exercise.archived ? (
                      <ArchiveRestore size={18} />
                    ) : (
                      <Archive size={18} />
                    ),
                    onClick: () => void toggleArchived(),
                  },
                  {
                    label: "Copy as new",
                    icon: <Copy size={18} />,
                    onClick: () =>
                      void navigate({
                        to: "/exercises/new",
                        search: { from: exercise.id },
                      }),
                  },
                ]}
              />
            )
          }
        />
      }
      // The save stays in reach however long the form is.
      footer={
        <div className="px-4 py-3 lg:px-0">
          <Button
            type="submit"
            form={FORM_ID}
            variant="primary"
            className="w-full sm:w-auto"
          >
            {exercise ? "Save exercise" : "Create exercise"}
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={save} noValidate className="pb-8">
        <div className="flex flex-col gap-5 px-4 lg:px-0">
          {exercise?.builtin && (
            <p className="-mb-2 text-sm text-ink-muted">
              Built in. Your changes are kept over catalog updates.
            </p>
          )}
          <Field label="Name" error={shown(problems.name) && "Enter a name."}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Row (Chest Supported)"
              aria-invalid={shown(problems.name)}
              className={inputClass}
            />
          </Field>

          <fieldset>
            <FieldLabel as="legend" className="pb-1.5">
              What a set records
            </FieldLabel>
            <div className="flex flex-col gap-1">
              {(Object.keys(EXERCISE_TYPE_LABELS) as ExerciseType[]).map(
                (t) => (
                  <label
                    key={t}
                    className="flex h-10 items-center gap-3 rounded-xl px-2 hover:bg-surface"
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

          <fieldset className="min-w-0">
            <FieldLabel as="legend" className="pb-1">
              Muscles
            </FieldLabel>
            <p
              className={clsx(
                "pb-3 text-sm",
                shown(problems.primary) ? "text-danger" : "text-ink-muted",
              )}
            >
              Tap a muscle once for secondary, twice for primary. Pick at least
              one primary.
            </p>
            <MuscleCycle
              muscles={muscles}
              targets={targets}
              onChange={setTargets}
            />
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Rest time"
              hint="m:ss. Empty uses your default."
              error={shown(problems.rest) && "Enter a time as m:ss."}
            >
              <input
                value={rest}
                onChange={(e) => setRest(e.target.value)}
                inputMode="numeric"
                placeholder={`Default ${formatDuration(settings.rest_default_s)}`}
                aria-invalid={shown(problems.rest)}
                className={inputClass}
              />
            </Field>
            <Field
              label={`Weight step (${unit})`}
              hint="Empty uses your default."
              error={shown(problems.increment) && "Enter a number above 0."}
            >
              <input
                value={increment}
                onChange={(e) => setIncrement(e.target.value)}
                inputMode="decimal"
                placeholder={`Default ${
                  unit === "kg"
                    ? settings.weight_increment_kg
                    : settings.weight_increment_lb
                }`}
                aria-invalid={shown(problems.increment)}
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
        </div>
      </form>
    </Screen>
  );
}

type Targets = Record<string, number>;

function byGroup(muscles: MuscleItem[]) {
  return MUSCLE_GROUPS.map((group) => ({
    group,
    muscles: muscles.filter((m) => m.group === group),
  })).filter((g) => g.muscles.length > 0);
}

const NEXT_FACTOR: Record<number, number> = { 0: 0.5, 0.5: 1, 1: 0 };

/**
 * One chip per muscle, by region, that steps through none, secondary, and
 * primary. Secondary is `aria-pressed="mixed"`: outlined with a hollow dot;
 * primary is a selected chip with a filled dot.
 */
function MuscleCycle(props: {
  muscles: MuscleItem[];
  targets: Targets;
  onChange: (targets: Targets) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {byGroup(props.muscles).map(({ group, muscles }) => (
        <Region key={group} group={group} label={group}>
          {muscles.map((muscle) => {
            const factor = props.targets[muscle.id] ?? 0;
            return (
              <button
                key={muscle.id}
                type="button"
                aria-pressed={
                  factor === 1 ? true : factor === 0.5 ? "mixed" : false
                }
                onClick={() =>
                  props.onChange({
                    ...props.targets,
                    [muscle.id]: NEXT_FACTOR[factor] ?? 0,
                  })
                }
                className={clsx(
                  chipClass(),
                  "aria-[pressed=mixed]:text-ink aria-[pressed=mixed]:ring-1 aria-[pressed=mixed]:ring-ink/50 aria-[pressed=mixed]:ring-inset",
                )}
              >
                {factor > 0 && (
                  <span
                    aria-hidden
                    className={clsx(
                      "size-2 rounded-full",
                      factor === 1 ? "bg-current" : "ring-[1.5px] ring-current",
                    )}
                  />
                )}
                {muscle.name}
              </button>
            );
          })}
        </Region>
      ))}
    </div>
  );
}

/** A body region's muscles, its name in a column beside them. */
function Region(props: {
  group: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset aria-label={props.label} className="flex min-w-0 gap-2">
      <span
        aria-hidden
        className="w-[4.5rem] shrink-0 pt-2 text-sm text-ink-muted"
      >
        {props.group}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {props.children}
      </div>
    </fieldset>
  );
}

const inputClass =
  "h-11 w-full rounded-xl bg-raised px-3 outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink aria-invalid:ring-2 aria-invalid:ring-danger";

function Field(props: {
  label: string;
  hint?: string;
  /** Shown instead of the hint once a save was tried. */
  error?: string | false;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child
    <label className="flex flex-col gap-1.5">
      <span className={fieldLabelClass}>{props.label}</span>
      {props.children}
      {props.error ? (
        <span className="text-sm text-danger">{props.error}</span>
      ) : (
        props.hint && (
          <span className="text-sm text-ink-muted">{props.hint}</span>
        )
      )}
    </label>
  );
}
