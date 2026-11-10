import type { ExerciseItem } from "@workout-logger/core";
import { Search } from "lucide-react";
import { Suspense, useState } from "react";
import { Sheet } from "../../components/sheet.tsx";
import { useDbQuery } from "../../db/react.tsx";
import { matchesSearch, primaryMuscles, useMuscleMap } from "./muscles.ts";

/**
 * Picks an exercise. For a substitution, the slot's alternatives come first,
 * then exercises sharing a primary muscle (most recently used first), then
 * everything else. Typing searches all exercises.
 */
export function ExercisePicker(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onPick: (exerciseId: string) => void;
  substituteFor?: { exerciseId: string | null; slotId: string | null };
}) {
  return (
    <Sheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.title}
    >
      <Suspense fallback={<div className="h-96" />}>
        <PickerBody
          onPick={(id) => {
            props.onOpenChange(false);
            props.onPick(id);
          }}
          substituteFor={props.substituteFor}
        />
      </Suspense>
    </Sheet>
  );
}

function PickerBody(props: {
  onPick: (exerciseId: string) => void;
  substituteFor?:
    | { exerciseId: string | null; slotId: string | null }
    | undefined;
}) {
  const exercises = useDbQuery("exercises");
  const options = useDbQuery("substitutionOptions", {
    exerciseId: props.substituteFor?.exerciseId ?? null,
    slotId: props.substituteFor?.slotId ?? null,
  });
  const muscles = useMuscleMap();
  const [query, setQuery] = useState("");

  const groups = (() => {
    const byId = new Map(exercises.map((e) => [e.id, e]));
    const pick = (ids: string[]) =>
      ids
        .map((id) => byId.get(id))
        .filter((e): e is ExerciseItem => Boolean(e));
    const current = props.substituteFor?.exerciseId;
    const live = exercises.filter((e) => !e.archived && e.id !== current);
    if (query.trim()) {
      return [
        {
          title: null,
          items: live.filter((e) => matchesSearch(e.name, query)),
        },
      ];
    }
    const alternatives = pick(options.alternativeIds);
    const similar = pick(options.similarIds);
    const shown = new Set([...alternatives, ...similar].map((e) => e.id));
    return [
      { title: "Alternatives", items: alternatives },
      { title: "Same muscles", items: similar },
      {
        title: shown.size > 0 ? "All exercises" : null,
        items: live.filter((e) => !shown.has(e.id)),
      },
    ].filter((g) => g.items.length > 0);
  })();

  return (
    <div>
      <div className="sticky top-0 z-10 bg-raised px-4 pt-3 pb-2">
        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises"
            aria-label="Search exercises"
            className="h-11 w-full rounded-xl bg-chalk pr-3 pl-10 outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink"
          />
        </div>
      </div>
      {groups.length === 0 && (
        <p className="px-4 py-8 text-center text-ink-muted">
          No exercise matches “{query}”. Create it under Exercises.
        </p>
      )}
      {groups.map((group) => (
        <section key={group.title ?? "results"} className="pb-2">
          {group.title && (
            <h3 className="px-4 pt-3 pb-1 text-sm font-semibold text-ink-muted">
              {group.title}
            </h3>
          )}
          <ul>
            {group.items.map((exercise) => (
              <li key={exercise.id}>
                <button
                  type="button"
                  onClick={() => props.onPick(exercise.id)}
                  className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-surface"
                >
                  <span className="font-medium">{exercise.name}</span>
                  <span className="text-sm text-ink-muted">
                    {primaryMuscles(exercise, muscles)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
