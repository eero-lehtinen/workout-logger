import { Link } from "@tanstack/react-router";
import type { ExerciseItem, MuscleItem } from "@workout-logger/core";
import { clsx } from "clsx";
import { Plus, Search } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { Button, buttonClass } from "../../components/button.tsx";
import { SectionHeading } from "../../components/headings.tsx";
import { listClass, rowClass } from "../../components/list.ts";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { useDbQuery } from "../../db/react.tsx";
import { matchesSearch } from "../../lib/search.ts";
import { MuscleGroupFilter } from "./muscle-group-filter.tsx";
import { inMuscleGroup, primaryMuscles, useMuscleMap } from "./muscles.ts";
import { sortExercises, useExerciseSort } from "./sort.ts";
import { ExerciseSortSelect } from "./sort-select.tsx";

export function ExercisesPage() {
  const exercises = useDbQuery("exercises");
  const muscles = useMuscleMap();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [sort] = useExerciseSort();

  const matching = sortExercises(
    exercises.filter(
      (e) =>
        matchesSearch(e.name, query) &&
        (!group || inMuscleGroup(e, group, muscles)),
    ),
    sort,
  );
  const active = matching.filter((e) => !e.archived);
  const archived = matching.filter((e) => e.archived);

  return (
    <Screen
      scrollId="exercises"
      header={
        <PageHeader
          title="Exercises"
          actions={
            <Link to="/exercises/new" className={buttonClass("ghost", "sm")}>
              <Plus size={17} />
              New
            </Link>
          }
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex gap-2 lg:w-[28rem] lg:shrink-0">
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
                  className="h-11 w-full rounded-xl bg-raised pr-3 pl-10 outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink"
                />
              </div>
              <ExerciseSortSelect />
            </div>
            <MuscleGroupFilter value={group} onChange={setGroup} />
          </div>
        </PageHeader>
      }
    >
      {active.length === 0 ? (
        <Empty>
          No exercises match.{" "}
          <Link
            to="/exercises/new"
            className="font-semibold text-ink underline underline-offset-2"
          >
            Create one
          </Link>
        </Empty>
      ) : (
        <ExerciseList exercises={active} muscles={muscles} />
      )}
      {archived.length > 0 && showArchived && (
        <section className="pt-6">
          <SectionHeading>Archived</SectionHeading>
          <ExerciseList exercises={archived} muscles={muscles} />
        </section>
      )}
      {archived.length > 0 && (
        <div className="px-4 pt-6 lg:px-0">
          <Button
            className="w-full lg:w-auto"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived
              ? "Hide archived exercises"
              : `Show ${archived.length} archived ${archived.length === 1 ? "exercise" : "exercises"}`}
          </Button>
        </div>
      )}
    </Screen>
  );
}

/**
 * One list that, on wide screens, flows top to bottom into two columns. Each
 * column is its own card: the rows carry the card's background and corners,
 * since the list itself spans both columns.
 */
function ExerciseList(props: {
  exercises: ExerciseItem[];
  muscles: Map<string, MuscleItem>;
}) {
  const count = props.exercises.length;
  const half = Math.ceil(count / 2);
  return (
    <ul
      className={`${listClass} lg:grid lg:grid-flow-col lg:grid-rows-(--rows) lg:gap-x-4 lg:overflow-visible lg:rounded-none lg:bg-transparent`}
      style={{ "--rows": `repeat(${half}, auto)` } as CSSProperties}
    >
      {props.exercises.map((e, i) => (
        <li
          key={e.id}
          className={clsx(
            "lg:overflow-clip lg:bg-raised",
            (i === 0 || i === half) && "lg:rounded-t-2xl",
            (i === half - 1 || i === count - 1) && "lg:rounded-b-2xl",
            i === half && "lg:before:hidden",
          )}
        >
          <Link
            to="/exercises/$exerciseId/history"
            params={{ exerciseId: e.id }}
            className={`${rowClass} flex items-center gap-3 py-2.5`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{e.name}</p>
              <p className="truncate text-sm text-ink-muted">
                {primaryMuscles(e, props.muscles) || "No muscles set"}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
