import { getRouteApi, Link } from "@tanstack/react-router";
import {
  type ExerciseHistory,
  exerciseRecords,
  type HistoryMetric,
  type HistoryPoint,
  historyMetrics,
  historySeries,
  type IsoDate,
  localDate,
  loggedWeights,
  setE1rmSeries,
  type WeekStart,
  type WeightUnit,
  weeklySets,
} from "@workout-logger/core";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/button.tsx";
import {
  BarChart,
  TimeChart,
  type TimeSeries,
} from "../../components/chart/index.tsx";
import { seriesColor } from "../../components/chart/theme.ts";
import { listClass, rowClass } from "../../components/list.ts";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { Segmented } from "../../components/segmented.tsx";
import { Select } from "../../components/select.tsx";
import { Switch } from "../../components/switch.tsx";
import { useDbQuery } from "../../db/react.tsx";
import {
  dateFromIso,
  formatSessionDate,
  formatWeightWithUnit,
  todayIso,
} from "../../lib/format.ts";
import { usePreference, useSwitchPreference } from "../../lib/preference.ts";
import { backToOrigin, type Origin, originOf } from "../exercises/origin.ts";
import { SetLine } from "../session/set-line.tsx";
import {
  formatMetric,
  formatTrendRate,
  isWeighted,
  METRIC_LABELS,
  type ValueMetric,
} from "./metrics.ts";
import { PERIOD_PHRASES, PERIODS, periodStart, usePeriod } from "./period.ts";
import { RecordsSection } from "./records.tsx";

const route = getRouteApi("/exercises/$exerciseId_/history");

const PAGE = 10;

export function ExerciseHistoryPage() {
  const { exerciseId } = route.useParams();
  const search = route.useSearch();
  const history = useDbQuery("exerciseHistory", { exerciseId });
  const settings = useDbQuery("settings");
  const unit = settings.weight_unit as WeightUnit;
  const origin = originOf(search);
  const back = backToOrigin(origin);

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
  return (
    <InPeriod
      history={history}
      unit={unit}
      back={back}
      editSearch={{ ...origin, from: "history" }}
    />
  );
}

/**
 * The page over the chosen period: the graph, the records, and the session
 * list all see only the sessions in it. Markers stay as they were at the
 * time, judged against all earlier history.
 */
function InPeriod(props: {
  history: ExerciseHistory;
  unit: WeightUnit;
  back: ReturnType<typeof backToOrigin>;
  editSearch: Origin & { from: "history" };
}) {
  const { history, unit } = props;
  const { exercise } = history;
  const [period, setPeriod] = usePeriod();
  const today = todayIso();
  const from = periodStart(period, today);
  const performances = from
    ? history.performances.filter((p) => localDate(p.startedAt, p.tz) >= from)
    : history.performances;
  const view: ExerciseHistory = {
    ...history,
    performances,
    records: from
      ? exerciseRecords(exercise.type, performances, {
          e1rmRepCap: history.e1rmRepCap,
        })
      : history.records,
  };
  const phrase = PERIOD_PHRASES[period];
  const first = history.performances[0];
  const logged = first !== undefined;
  // Weekly charts start at the period, but never before the first session.
  const firstDate = first && localDate(first.startedAt, first.tz);
  const chartFrom = from && firstDate && from > firstDate ? from : firstDate;

  return (
    <Screen
      scrollId="exercise-history"
      header={
        <PageHeader
          title={exercise.name}
          subtitle={
            logged
              ? `${performances.length} ${performances.length === 1 ? "session" : "sessions"} ${phrase}`.trim()
              : "Not logged yet"
          }
          back={props.back}
          actions={
            <Link
              to="/exercises/$exerciseId"
              params={{ exerciseId: exercise.id }}
              search={props.editSearch}
              aria-label="Edit exercise"
              title="Edit exercise"
              className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-surface"
            >
              <SlidersHorizontal size={20} />
            </Link>
          }
        >
          {logged && (
            <Segmented
              label="Period"
              size="sm"
              value={period}
              onChange={setPeriod}
              options={PERIODS}
            />
          )}
        </PageHeader>
      }
    >
      {!logged ? (
        <Empty>Sets you log of this exercise show up here.</Empty>
      ) : performances.length === 0 ? (
        <Empty>No sets of this exercise {phrase}.</Empty>
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
          <div className="flex flex-col gap-8">
            <ProgressChart
              key={exercise.id}
              history={view}
              from={chartFrom ?? null}
              unit={unit}
            />
            <RecordsSection history={view} unit={unit} period={period} />
          </div>
          <PastSessions history={view} unit={unit} />
        </div>
      )}
    </Screen>
  );
}

function ProgressChart(props: {
  history: ExerciseHistory;
  /** The period's first date; null for all time. */
  from: IsoDate | null;
  unit: WeightUnit;
}) {
  const { history, unit } = props;
  const { exercise, performances } = history;
  const metrics = historyMetrics(exercise.type);
  // One metric for every exercise: a type without it shows its first metric
  // and leaves the stored one for the exercises that have it.
  const [metric, setMetric] = usePreference<HistoryMetric>(
    "history-metric",
    metrics,
    metrics[0] ?? "best_e1rm",
  );
  const [trend, setTrend] = useSwitchPreference("history-trend", true);
  const weights = isWeighted(exercise.type) ? loggedWeights(performances) : [];
  const mostUsed = weights.reduce<(typeof weights)[number] | undefined>(
    (best, w) => (!best || w.sessions > best.sessions ? w : best),
    undefined,
  );
  // Per exercise, since weights differ between exercises. One that isn't in
  // the period falls back to the period's most used weight.
  const [weight, setWeight] = usePreference(
    `history-weight:${exercise.id}`,
    weights.map((w) => String(w.weightKg)),
    String(mostUsed?.weightKg ?? ""),
  );
  const weightKg = mostUsed ? Number(weight) : undefined;
  return (
    <section className="px-4 pt-2 lg:px-0">
      <h2 className="sr-only">Progress</h2>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-3 text-[0.9375rem]">
        <Select
          label="Metric"
          value={metric}
          onChange={setMetric}
          options={metrics.map((m) => ({ value: m, label: METRIC_LABELS[m] }))}
        />
        {metric === "reps_at_weight" && (
          <Select
            label="Weight"
            value={weight}
            onChange={setWeight}
            options={weights.map((w) => ({
              value: String(w.weightKg),
              label: `${formatWeightWithUnit(w.weightKg, unit)} (${w.sessions} ${w.sessions === 1 ? "session" : "sessions"})`,
            }))}
          />
        )}
        {metric !== "weekly_sets" && metric !== "set_e1rm" && (
          <span className="flex items-center gap-3">
            <Switch label="Trend line" checked={trend} onChange={setTrend} />
            <span aria-hidden className="text-ink-muted">
              Trend line
            </span>
          </span>
        )}
      </div>
      {metric === "weekly_sets" ? (
        <WeeklySetsChart history={history} from={props.from} />
      ) : (
        <MetricChart
          history={history}
          metric={metric}
          weightKg={weightKg}
          trend={trend}
          unit={unit}
        />
      )}
    </section>
  );
}

const sessionDate = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** One colored line, or one per set number for every set's e1RM. */
function chartSeries(
  history: ExerciseHistory,
  metric: ValueMetric,
  weightKg: number | undefined,
  trend: boolean,
): TimeSeries[] {
  const options = {
    e1rmRepCap: history.e1rmRepCap,
    ...(weightKg !== undefined && { weightKg }),
  };
  const toPoints = (points: HistoryPoint[]) =>
    points.map((p) => ({ t: p.at, v: p.value }));
  if (metric === "set_e1rm") {
    return setE1rmSeries(history.performances, options).map((s, i) => ({
      id: `set-${s.setNumber}`,
      label: `Set ${s.setNumber}`,
      points: toPoints(s.points),
      kind: "line",
      color: seriesColor(i),
    }));
  }
  const points = toPoints(
    historySeries(history.exercise.type, history.performances, metric, options),
  );
  if (points.length === 0) return [];
  return [
    {
      id: metric,
      label: METRIC_LABELS[metric],
      points,
      kind: "line",
      color: seriesColor(0),
      trend,
    },
  ];
}

function MetricChart(props: {
  history: ExerciseHistory;
  metric: ValueMetric;
  weightKg: number | undefined;
  trend: boolean;
  unit: WeightUnit;
}) {
  const { history, metric, unit } = props;
  const series = chartSeries(history, metric, props.weightKg, props.trend);
  if (series.length === 0) {
    return (
      <p className="py-10 text-center text-[0.9375rem] text-ink-muted">
        {metric === "best_e1rm" || metric === "set_e1rm"
          ? "No sets within the e1RM rep limit yet."
          : "Nothing to show for this metric yet."}
      </p>
    );
  }
  return (
    <TimeChart
      label={METRIC_LABELS[metric]}
      height={260}
      series={series}
      formatValue={(v) => formatMetric(metric, v, unit)}
      formatTrend={(perDay) => formatTrendRate(metric, perDay, unit)}
      formatTime={(t) => sessionDate.format(t)}
    />
  );
}

const weekLabel = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const average = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Every week since the first performance, empty weeks included. */
function WeeklySetsChart(props: {
  history: ExerciseHistory;
  from: IsoDate | null;
}) {
  const settings = useDbQuery("settings");
  const { weeks, average: mean } = weeklySets(
    props.history.performances,
    { from: props.from, to: todayIso() },
    settings.week_start as WeekStart,
  );
  return (
    <BarChart
      label="Sets per week"
      xKind="time"
      height={260}
      bars={weeks.map((w) => ({ x: dateFromIso(w.week), v: w.count }))}
      formatX={(x) => `Week of ${weekLabel.format(x)}`}
      formatValue={(v) => `${v} ${v === 1 ? "set" : "sets"}`}
      formatTick={String}
      reference={{ value: mean, label: `Average ${average.format(mean)}` }}
    />
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
              search={{ exerciseId: history.exercise.id }}
              className={`${rowClass} block py-2.5`}
            >
              <p className="pb-1 text-sm font-medium">
                {formatSessionDate(p.startedAt, p.tz)}
              </p>
              <SetLine sets={p.sets} type={history.exercise.type} unit={unit} />
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
