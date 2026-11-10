import { Link } from "@tanstack/react-router";
import { MUSCLE_GROUPS } from "@workout-logger/exercises";
import { clsx } from "clsx";
import { ChevronRight, Plus, Search } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "../../components/button.tsx";
import { Empty, PageHeader } from "../../components/page.tsx";
import { useDbQuery } from "../../db/react.tsx";
import { matchesSearch, primaryMuscles, useMuscleMap } from "./muscles.ts";

export function ExercisesPage() {
  const exercises = useDbQuery("exercises");
  const muscles = useMuscleMap();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const shown = exercises.filter(
    (e) =>
      e.archived === showArchived &&
      matchesSearch(e.name, query) &&
      (!group ||
        Object.entries(e.muscles).some(
          ([id, factor]) => factor === 1 && muscles.get(id)?.group === group,
        )),
  );

  return (
    <div>
      <PageHeader
        title="Exercises"
        actions={
          <Link to="/exercises/new" className={buttonClass("ghost", "sm")}>
            <Plus size={17} />
            New
          </Link>
        }
      />
      <div className="flex flex-col gap-3 px-4 pb-3 lg:flex-row lg:items-center lg:px-0">
        <div className="relative lg:w-80">
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
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
          {[null, ...MUSCLE_GROUPS].map((g) => (
            <button
              key={g ?? "all"}
              type="button"
              aria-pressed={group === g}
              onClick={() => setGroup(g)}
              className={clsx(
                "h-9 shrink-0 rounded-full px-3.5 text-sm font-medium",
                group === g
                  ? "bg-ink text-chalk"
                  : "bg-surface text-ink-muted hover:text-ink",
              )}
            >
              {g ?? "All"}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <Empty>
          {showArchived
            ? "No archived exercises match."
            : "No exercises match. "}
          {!showArchived && (
            <Link
              to="/exercises/new"
              className="font-semibold text-ink underline underline-offset-2"
            >
              Create one
            </Link>
          )}
        </Empty>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule lg:grid lg:grid-cols-2 lg:gap-x-6 lg:divide-y-0 lg:border-0">
          {shown.map((e) => (
            <li key={e.id} className="lg:border-b lg:border-rule">
              <Link
                to="/exercises/$exerciseId"
                params={{ exerciseId: e.id }}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface lg:px-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.name}</p>
                  <p className="truncate text-sm text-ink-muted">
                    {primaryMuscles(e, muscles) || "No muscles set"}
                  </p>
                </div>
                <ChevronRight size={18} className="text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="px-4 pt-4 lg:px-0">
        <button
          type="button"
          onClick={() => setShowArchived(!showArchived)}
          className="text-[0.9375rem] font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline"
        >
          {showArchived ? "Show active exercises" : "Show archived exercises"}
        </button>
      </div>
    </div>
  );
}
