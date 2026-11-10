import { getRouteApi, Link } from "@tanstack/react-router";
import {
  type ExerciseHistory,
  type HistoryMetric,
  historyMetrics,
  historySeries,
  loggedWeights,
  type WeightUnit,
} from "@workout-logger/core";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/button.tsx";
import { TimeChart } from "../../components/chart/index.tsx";
import { listClass, rowClass } from "../../components/list.ts";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { Segmented } from "../../components/segmented.tsx";
import { useDbQuery } from "../../db/react.tsx";
import {
  formatSessionDate,
  formatSet,
  formatWeightWithUnit,
} from "../../lib/format.ts";
import { Marker } from "../session/marker.tsx";
import { formatMetric, isWeighted, METRIC_LABELS } from "./metrics.ts";
import { RecordsSection } from "./records.tsx";

const route = getRouteApi("/exercises/$exerciseId_/history");

const PAGE = 10;

export function ExerciseHistoryPage() {
  const { exerciseId } = route.useParams();
  const search = route.useSearch();
  const history = useDbQuery("exerciseHistory", { exerciseId });
  const settings = useDbQuery("settings");
  const unit = settings.weight_unit as WeightUnit;
  const fromSession = "sessionId" in search ? search : null;
  const back = fromSession
    ? {
        to: "/sessions/$sessionId/$sessionExerciseId" as const,
        params: fromSession,
        label: "Back to logging",
      }
    : { to: "/exercises" as const, label: "Back to exercises" };

  if (!history) {
    return (
      <Screen
        header={<PageHeader title="Exercise" back={back} />}
        scrollId="exercise-history-deleted"
      >
        <Empty>This exercise was deleted.</Empty>
      </Screen>
    );
  }
  const { exercise, performances } = history;
  return (
    <Screen
      scrollId="exercise-history"
      header={
        <PageHeader
          title={exercise.name}
          subtitle={
            performances.length === 0
              ? "Not logged yet"
              : `${performances.length} ${performances.length === 1 ? "session" : "sessions"}`
          }
          back={back}
          actions={
            <Link
              to="/exercises/$exerciseId"
              params={{ exerciseId }}
              search={fromSession ?? {}}
              aria-label="Edit exercise"
              title="Edit exercise"
              className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-surface"
            >
              <SlidersHorizontal size={20} />
            </Link>
          }
        />
      }
    >
      {performances.length === 0 ? (
        <Empty>Sets you log of this exercise show up here.</Empty>
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
          <div className="flex flex-col gap-8">
            <ProgressChart key={exercise.id} history={history} unit={unit} />
            <RecordsSection history={history} unit={unit} />
          </div>
          <PastSessions history={history} unit={unit} />
        </div>
      )}
    </Screen>
  );
}

function ProgressChart(props: { history: ExerciseHistory; unit: WeightUnit }) {
  const { history, unit } = props;
  const { exercise, performances } = history;
  const metrics = historyMetrics(exercise.type);
  const [metric, setMetric] = useState<HistoryMetric>(
    metrics[0] ?? "best_e1rm",
  );
  const weights = isWeighted(exercise.type) ? loggedWeights(performances) : [];
  const [weightKg, setWeightKg] = useState(
    () =>
      weights.reduce<(typeof weights)[number] | undefined>(
        (best, w) => (!best || w.sessions > best.sessions ? w : best),
        undefined,
      )?.weightKg,
  );
  const points = historySeries(exercise.type, performances, metric, {
    e1rmRepCap: history.e1rmRepCap,
    ...(weightKg !== undefined && { weightKg }),
  }).map((p) => ({ t: p.at, v: p.value }));

  return (
    <section className="px-4 pt-2 lg:px-0">
      <h2 className="sr-only">Progress</h2>
      <div className="-mx-4 overflow-x-auto px-4 pb-3 lg:mx-0 lg:px-0">
        <Segmented
          label="Metric"
          size="sm"
          value={metric}
          onChange={setMetric}
          options={metrics.map((m) => ({ value: m, label: METRIC_LABELS[m] }))}
        />
      </div>
      {metric === "reps_at_weight" && (
        <label className="flex items-center gap-2 pb-3 text-[0.9375rem]">
          <span className="text-ink-muted">Weight</span>
          <select
            value={weightKg ?? ""}
            onChange={(e) => setWeightKg(Number(e.target.value))}
            className="h-9 rounded-lg bg-raised px-2 ring-1 ring-rule"
          >
            {weights.map((w) => (
              <option key={w.weightKg} value={w.weightKg}>
                {formatWeightWithUnit(w.weightKg, unit)} ({w.sessions}{" "}
                {w.sessions === 1 ? "session" : "sessions"})
              </option>
            ))}
          </select>
        </label>
      )}
      {points.length === 0 ? (
        <p className="py-10 text-center text-[0.9375rem] text-ink-muted">
          {metric === "best_e1rm" || metric === "set_e1rm"
            ? "No sets within the e1RM rep limit yet."
            : "Nothing to show for this metric yet."}
        </p>
      ) : (
        <TimeChart
          label={METRIC_LABELS[metric]}
          height={260}
          series={[
            {
              id: metric,
              label: METRIC_LABELS[metric],
              points,
              kind: metric === "set_e1rm" ? "points" : "line",
              color: "ink",
            },
          ]}
          formatValue={(v) => formatMetric(metric, v, unit)}
          formatTime={(t) =>
            new Intl.DateTimeFormat(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            }).format(t)
          }
        />
      )}
    </section>
  );
}

function PastSessions(props: { history: ExerciseHistory; unit: WeightUnit }) {
  const { history, unit } = props;
  const [shown, setShown] = useState(PAGE);
  const newestFirst = [...history.performances].reverse();
  return (
    <section className="pt-8 lg:pt-2">
      <h2 className="px-4 pb-2 text-lg font-semibold lg:px-0">Sessions</h2>
      <ul className={listClass}>
        {newestFirst.slice(0, shown).map((p) => (
          <li key={p.sessionId}>
            <Link
              to="/sessions/$sessionId"
              params={{ sessionId: p.sessionId }}
              className={`${rowClass} block py-2`}
            >
              <p className="text-sm text-ink-muted">
                {formatSessionDate(p.startedAt, p.tz)}
              </p>
              <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                {p.sets.map((set) => (
                  <li
                    key={set.id}
                    className="numerals inline-flex items-center gap-0.5 text-lg"
                  >
                    {formatSet(set, history.exercise.type, unit)}
                    <Marker
                      marker={set.marker}
                      type={history.exercise.type}
                      unit={unit}
                    />
                  </li>
                ))}
              </ul>
            </Link>
          </li>
        ))}
      </ul>
      {newestFirst.length > shown && (
        <div className="px-4 pt-2 lg:px-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShown(shown + 2 * PAGE)}
          >
            Show older sessions
          </Button>
        </div>
      )}
    </section>
  );
}
