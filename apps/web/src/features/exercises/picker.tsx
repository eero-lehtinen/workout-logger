import type { ExerciseItem } from "@workout-logger/core";
import { Search } from "lucide-react";
import { Suspense, useState } from "react";
import { Sheet } from "../../components/sheet.tsx";
import { useDbQuery } from "../../db/react.tsx";
import { matchesSearch } from "../../lib/search.ts";
import { MuscleGroupFilter } from "./muscle-group-filter.tsx";
import {
  inMuscleGroup,
  primaryMuscles,
  sharesPrimaryMuscle,
  useMuscleMap,
} from "./muscles.ts";
import { sortExercises, useExerciseSort } from "./sort.ts";
import { ExerciseSortSelect } from "./sort-select.tsx";

/**
 * Picks an exercise. For a substitution, the slot's alternatives come first,
 * then exercises sharing a primary muscle, then everything else, each in the
 * chosen order. Typing searches all exercises. A muscle group narrows every
 * list.
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
  const [group, setGroup] = useState<string | null>(null);
  const [sort] = useExerciseSort();

  const sections = (() => {
    const inGroup = (e: ExerciseItem) =>
      !group || inMuscleGroup(e, group, muscles);
    const current = exercises.find(
      (e) => e.id === props.substituteFor?.exerciseId,
    );
    const live = sortExercises(
      exercises.filter((e) => !e.archived && e !== current && inGroup(e)),
      sort,
    );
    if (query.trim()) {
      return [
        {
          title: null,
          items: live.filter((e) => matchesSearch(e.name, query)),
        },
      ];
    }
    const alternativeIds = new Set(options.alternativeIds);
    const alternatives = live.filter((e) => alternativeIds.has(e.id));
    const similar = current
      ? live.filter(
          (e) => !alternativeIds.has(e.id) && sharesPrimaryMuscle(e, current),
        )
      : [];
    const shown = new Set([...alternatives, ...similar]);
    return [
      { title: "Alternatives", items: alternatives },
      { title: "Same muscles", items: similar },
      {
        title: shown.size > 0 ? "All exercises" : null,
        items: live.filter((e) => !shown.has(e)),
      },
    ].filter((s) => s.items.length > 0);
  })();

  return (
    <div>
      <div className="sticky top-0 z-10 flex flex-col gap-2 bg-raised px-4 pt-3 pb-2">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
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
          <ExerciseSortSelect />
        </div>
        <MuscleGroupFilter value={group} onChange={setGroup} />
      </div>
      {sections.length === 0 && (
        <p className="px-4 py-8 text-center text-ink-muted">
          No exercise matches. Create it under Exercises.
        </p>
      )}
      {sections.map((section) => (
        <section key={section.title ?? "results"} className="pb-2">
          {section.title && (
            <h3 className="px-4 pt-3 pb-1 text-sm font-semibold text-ink-muted">
              {section.title}
            </h3>
          )}
          <ul className="dividers [--divider-inset:1rem]">
            {section.items.map((exercise) => (
              <li key={exercise.id}>
                <button
                  type="button"
                  onClick={() => props.onPick(exercise.id)}
                  className="row flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-surface"
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
