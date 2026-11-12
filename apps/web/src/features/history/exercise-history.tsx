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
import { Maximize2, Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, IconButton } from "../../components/button.tsx";
import {
  BarChart,
  type ChartHeight,
  TimeChart,
  type TimeSeries,
} from "../../components/chart/index.tsx";
import { seriesColor } from "../../components/chart/theme.ts";
import { SectionHeading } from "../../components/headings.tsx";
import { listClass, rowClass } from "../../components/list.ts";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { Segmented } from "../../components/segmented.tsx";
import { Select } from "../../components/select.tsx";
import { FullScreen } from "../../components/sheet.tsx";
import { Switch } from "../../components/switch.tsx";
import { useDbQuery } from "../../db/react.tsx";
import { i18n } from "../../i18n/index.ts";
import {
  dateFormat,
  dateFromIso,
  formatSessionDate,
  formatWeightWithUnit,
  numberFormat,
  todayIso,
} from "../../lib/format.ts";
import { usePreference, useSwitchPreference } from "../../lib/preference.ts";
import { backToOrigin, type Origin, originOf } from "../exercises/origin.ts";
import { SetLine } from "../session/set-line.tsx";
import { ONE_DECIMAL, SHORT_DATE } from "./format-options.ts";
import {
  formatMetric,
  formatTrendRate,
  isWeighted,
  metricLabel,
  type ValueMetric,
} from "./metrics.ts";
import {
  periodNoSets,
  periodOptions,
  periodSessions,
  periodStart,
  usePeriod,
} from "./period.ts";
import { RecordsSection } from "./records.tsx";

const route = getRouteApi("/exercises/$exerciseId_/history");

const PAGE = 10;

export function ExerciseHistoryPage() {
  const { t } = useTranslation();
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
        header={<PageHeader title={t("history.exercise.title")} back={back} />}
        scrollId="exercise-history-deleted"
      >
        <Empty>{t("history.exercise.deleted")}</Empty>
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
  const { t } = useTranslation();
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
              ? periodSessions(period, performances.length)
              : t("history.exercise.notLogged")
          }
          back={props.back}
          actions={
            <Link
              to="/exercises/$exerciseId"
              params={{ exerciseId: exercise.id }}
              search={props.editSearch}
              aria-label={t("history.exercise.edit")}
              title={t("history.exercise.edit")}
              className="inline-flex size-10 items-center justify-center rounded-xl hover:bg-surface"
            >
              <Pencil size={19} />
            </Link>
          }
        >
          {logged && (
            <Segmented
              label={t("history.periods.label")}
              size="sm"
              value={period}
              onChange={setPeriod}
              options={periodOptions()}
            />
          )}
        </PageHeader>
      }
    >
      {!logged ? (
        <Empty>{t("history.exercise.neverLogged")}</Empty>
      ) : performances.length === 0 ? (
        <Empty>
          {period === "all"
            ? t("history.exercise.neverLogged")
            : periodNoSets(period)}
        </Empty>
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
  const { t } = useTranslation();
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
  const [fullScreen, setFullScreen] = useState(false);
  const controls = (
    <>
      <Select
        label={t("history.exercise.metric")}
        value={metric}
        onChange={setMetric}
        options={metrics.map((m) => ({ value: m, label: metricLabel(m) }))}
      />
      {metric === "reps_at_weight" && (
        <Select
          label={t("history.exercise.weight")}
          value={weight}
          onChange={setWeight}
          options={weights.map((w) => ({
            value: String(w.weightKg),
            label: t("history.exercise.weightOption", {
              weight: formatWeightWithUnit(w.weightKg, unit),
              count: w.sessions,
            }),
          }))}
        />
      )}
      {metric !== "weekly_sets" && metric !== "set_e1rm" && (
        <span className="flex items-center gap-3">
          <Switch
            label={t("history.exercise.trendLine")}
            checked={trend}
            onChange={setTrend}
          />
          <span aria-hidden className="text-ink-muted">
            {t("history.exercise.trendLine")}
          </span>
        </span>
      )}
    </>
  );
  const chart = (height: ChartHeight) =>
    metric === "weekly_sets" ? (
      <WeeklySetsChart history={history} from={props.from} height={height} />
    ) : (
      <MetricChart
        history={history}
        metric={metric}
        weightKg={weightKg}
        trend={trend}
        unit={unit}
        height={height}
      />
    );
  return (
    <section className="px-4 lg:px-0">
      <h2 className="sr-only">{t("history.exercise.progress")}</h2>
      <div className={controlsClass}>
        {controls}
        <IconButton
          label={t("history.exercise.fullScreen")}
          className="-my-1 ml-auto"
          onClick={() => setFullScreen(true)}
        >
          <Maximize2 size={19} />
        </IconButton>
      </div>
      {chart(CHART_HEIGHT)}
      <FullScreen
        open={fullScreen}
        onOpenChange={setFullScreen}
        title={exercise.name}
      >
        <div className="flex min-h-0 flex-1 flex-col px-4 pt-3 pb-4 lg:px-8">
          <div className={controlsClass}>{controls}</div>
          {chart("fill")}
        </div>
      </FullScreen>
    </section>
  );
}

const controlsClass =
  "flex flex-wrap items-center gap-x-4 gap-y-2 pb-3 text-[0.9375rem]";

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
      label: i18n.t("history.exercise.setNumber", { number: s.setNumber }),
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
      label: metricLabel(metric),
      points,
      kind: "line",
      color: seriesColor(0),
      trend,
    },
  ];
}

const CHART_HEIGHT = 360;

function MetricChart(props: {
  history: ExerciseHistory;
  metric: ValueMetric;
  weightKg: number | undefined;
  trend: boolean;
  unit: WeightUnit;
  height: ChartHeight;
}) {
  const { history, metric, unit } = props;
  const { t } = useTranslation();
  const series = chartSeries(history, metric, props.weightKg, props.trend);
  if (series.length === 0) {
    return (
      <p className="py-10 text-center text-[0.9375rem] text-ink-muted">
        {metric === "best_e1rm" || metric === "set_e1rm"
          ? t("history.exercise.noE1rmSets")
          : t("history.exercise.nothingToShow")}
      </p>
    );
  }
  return (
    <TimeChart
      label={metricLabel(metric)}
      height={props.height}
      series={series}
      formatValue={(v) => formatMetric(metric, v, unit)}
      formatTrend={(perDay) => formatTrendRate(metric, perDay, unit)}
      formatTime={(at) =>
        dateFormat({
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(at)
      }
    />
  );
}

/** Every week since the first performance, empty weeks included. */
function WeeklySetsChart(props: {
  history: ExerciseHistory;
  from: IsoDate | null;
  height: ChartHeight;
}) {
  const { t } = useTranslation();
  const settings = useDbQuery("settings");
  const { weeks, average: mean } = weeklySets(
    props.history.performances,
    { from: props.from, to: todayIso() },
    settings.week_start as WeekStart,
  );
  return (
    <BarChart
      label={t("history.exercise.setsPerWeek")}
      xKind="time"
      height={props.height}
      bars={weeks.map((w) => ({ x: dateFromIso(w.week), v: w.count }))}
      formatX={(x) =>
        t("history.exercise.weekOf", {
          date: dateFormat(SHORT_DATE).format(x),
        })
      }
      formatValue={(v) => t("history.exercise.setCount", { count: v })}
      formatTick={String}
      reference={{
        value: mean,
        label: t("history.exercise.average", {
          value: numberFormat(ONE_DECIMAL).format(mean),
        }),
      }}
    />
  );
}

function PastSessions(props: { history: ExerciseHistory; unit: WeightUnit }) {
  const { history, unit } = props;
  const { t } = useTranslation();
  const [shown, setShown] = useState(PAGE);
  const newestFirst = [...history.performances].reverse();
  return (
    <section className="pt-8 lg:pt-0">
      <SectionHeading>{t("history.exercise.sessions")}</SectionHeading>
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
            {t("history.exercise.showOlder")}
          </Button>
        </div>
      )}
    </section>
  );
}
