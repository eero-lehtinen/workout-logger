import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  type ExerciseDetail,
  type ExerciseType,
  fromKg,
  roundTo,
  toKg,
} from "@workout-logger/core";
import { MUSCLE_GROUPS } from "@workout-logger/exercises";
import { clsx } from "clsx";
import { useState } from "react";
import { Button } from "../../components/button.tsx";
import { Empty, PageHeader } from "../../components/page.tsx";
import { Segmented } from "../../components/segmented.tsx";
import { parseDuration, parseNumber } from "../../components/stepper.tsx";
import { useCommand, useDbQuery } from "../../db/react.tsx";
import { EXERCISE_TYPE_LABELS, formatDuration } from "../../lib/format.ts";

const route = getRouteApi("/exercises/$exerciseId");

export function EditExercisePage() {
  const { exerciseId } = route.useParams();
  const exercise = useDbQuery("exerciseDetail", { exerciseId });
  if (!exercise) {
    return (
      <>
        <PageHeader
          title="Exercise"
          back={{ to: "/exercises", label: "Back to exercises" }}
        />
        <Empty>This exercise was deleted.</Empty>
      </>
    );
  }
  return <ExerciseForm key={exercise.id} exercise={exercise} />;
}

export function NewExercisePage() {
  return <ExerciseForm exercise={null} />;
}

const FACTOR_OPTIONS = [
  { value: "0", label: "–" },
  { value: "0.5", label: "Secondary" },
  { value: "1", label: "Primary" },
] as const;

function ExerciseForm({ exercise }: { exercise: ExerciseDetail | null }) {
  const muscles = useDbQuery("muscles");
  const settings = useDbQuery("settings");
  const unit = settings.weight_unit;
  const command = useCommand();
  const navigate = useNavigate();

  const [name, setName] = useState(exercise?.name ?? "");
  const [type, setType] = useState<ExerciseType>(
    exercise?.type ?? "weight_reps",
  );
  const [targets, setTargets] = useState<Record<string, number>>(
    exercise?.muscles ?? {},
  );
  const [rest, setRest] = useState(
    exercise?.defaultRestS == null ? "" : formatDuration(exercise.defaultRestS),
  );
  const [increment, setIncrement] = useState(
    exercise?.weightIncrementKg == null
      ? ""
      : String(roundTo(fromKg(exercise.weightIncrementKg, unit), 3)),
  );
  const [notes, setNotes] = useState(exercise?.notes ?? "");

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
      await navigate({ to: "/exercises" });
    } else if (await command("createExercise", fields)) {
      await navigate({ to: "/exercises" });
    }
  }

  return (
    <form onSubmit={save} className="mx-auto max-w-3xl pb-8">
      <PageHeader
        title={exercise ? "Edit exercise" : "New exercise"}
        subtitle={
          exercise?.builtin
            ? "Built in. Your changes are kept over catalog updates."
            : undefined
        }
        back={{ to: "/exercises", label: "Back to exercises" }}
      />
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
            {(Object.keys(EXERCISE_TYPE_LABELS) as ExerciseType[]).map((t) => (
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
            ))}
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
            At least one primary muscle. Frequency stats count primary muscles.
          </p>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {MUSCLE_GROUPS.map((group) => (
              <div key={group}>
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
                        value={String(targets[muscle.id] ?? 0)}
                        options={FACTOR_OPTIONS}
                        onChange={(value) =>
                          setTargets({ ...targets, [muscle.id]: Number(value) })
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
          <Button type="submit" variant="primary" disabled={invalid}>
            {exercise ? "Save exercise" : "Create exercise"}
          </Button>
          {exercise && (
            <Button
              onClick={async () => {
                await command("updateExercise", {
                  exerciseId: exercise.id,
                  archived: !exercise.archived,
                });
                await navigate({ to: "/exercises" });
              }}
            >
              {exercise.archived ? "Unarchive" : "Archive"}
            </Button>
          )}
        </div>
      </div>
    </form>
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
