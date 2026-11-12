import { Link } from "@tanstack/react-router";
import type {
  BestSet,
  ExerciseItem,
  ExerciseType,
  MuscleItem,
  WeightUnit,
} from "@workout-logger/core";
import { clsx } from "clsx";
import { Plus, Search } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, buttonClass } from "../../components/button.tsx";
import { SectionHeading } from "../../components/headings.tsx";
import { listClass, rowClass } from "../../components/list.ts";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { SetText } from "../../components/set-text.tsx";
import { useDbQuery } from "../../db/react.tsx";
import { matchesSearch } from "../../lib/search.ts";
import { formatHeadline } from "../history/metrics.ts";
import { MuscleGroupFilter } from "./muscle-group-filter.tsx";
import { inMuscleGroup, primaryMuscles, useMuscleMap } from "./muscles.ts";
import { sortExercises, useExerciseSort } from "./sort.ts";
import { ExerciseSortSelect } from "./sort-select.tsx";

export function ExercisesPage() {
  const { t } = useTranslation();
  const exercises = useDbQuery("exercises");
  const unit = useDbQuery("settings").weight_unit as WeightUnit;
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
          title={t("exercises.list.title")}
          actions={
            <Link to="/exercises/new" className={buttonClass("ghost", "sm")}>
              <Plus size={17} />
              {t("exercises.list.new")}
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
                  placeholder={t("exercises.list.search")}
                  aria-label={t("exercises.list.search")}
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
          {t("exercises.list.noMatch")}{" "}
          <Link
            to="/exercises/new"
            className="font-semibold text-ink underline underline-offset-2"
          >
            {t("exercises.list.createOne")}
          </Link>
        </Empty>
      ) : (
        <ExerciseList exercises={active} muscles={muscles} unit={unit} />
      )}
      {archived.length > 0 && showArchived && (
        <section className="pt-6">
          <SectionHeading>{t("exercises.list.archived")}</SectionHeading>
          <ExerciseList exercises={archived} muscles={muscles} unit={unit} />
        </section>
      )}
      {archived.length > 0 && (
        <div className="px-4 pt-6 lg:px-0">
          <Button
            className="w-full lg:w-auto"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived
              ? t("exercises.list.hideArchived")
              : t("exercises.list.showArchived", { count: archived.length })}
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
  unit: WeightUnit;
}) {
  const { t } = useTranslation();
  const count = props.exercises.length;
  const half = Math.ceil(count / 2);
  return (
    <ul
      className={`${listClass} lg:grid lg:grid-flow-col lg:grid-cols-2 lg:grid-rows-(--rows) lg:gap-x-4 lg:overflow-visible lg:rounded-none lg:bg-transparent`}
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
                {primaryMuscles(e, props.muscles) ||
                  t("exercises.list.noMuscles")}
              </p>
            </div>
            {e.loggedSets > 0 && (
              <div className="shrink-0 text-right">
                {e.best && (
                  <p className="tabular text-[0.9375rem] text-ink/85">
                    <Best best={e.best} type={e.type} unit={props.unit} />
                  </p>
                )}
                <p className="tabular text-sm text-ink-muted">
                  {t("exercises.list.sets", { count: e.loggedSets })}
                </p>
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The best set as a set, e.g. `100 kg × 8`; reps, time, or distance alone. */
function Best(props: { best: BestSet; type: ExerciseType; unit: WeightUnit }) {
  const { best, type, unit } = props;
  return best.set ? (
    <SetText set={best.set} type={type} unit={unit} />
  ) : (
    formatHeadline(best.kind, best.value, unit)
  );
}
