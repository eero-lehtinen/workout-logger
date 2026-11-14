import type { LineSeriesOption, ScatterSeriesOption } from "echarts/charts";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChartFrame } from "./frame.tsx";
import {
  baseOption,
  grid,
  timeAxis,
  tooltip,
  tooltipHtml,
  valueAxis,
  zoomOptions,
} from "./options.ts";
import { formatSpan, seriesSpan } from "./range.ts";
import { type ChartTheme, useChartTheme } from "./theme.ts";
import { linearTrend, type Trend } from "./trend.ts";
import type { TimeChartProps, TimePoint, TimeSeries } from "./types.ts";
import {
  useChartOption,
  useEChart,
  useVisibleRange,
  useZoomReset,
} from "./use-echart.ts";

interface AxisParam {
  seriesId?: string;
  axisValue?: number | string;
  /** The index in the series' `points`, also when zoomed. */
  dataIndex: number;
}

export default function EChartsTimeChart(props: TimeChartProps) {
  const { t } = useTranslation();
  const theme = useChartTheme();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const chart = useEChart(el);
  const range = useVisibleRange(chart);
  const trends = props.series.flatMap((s) => {
    const trend = s.trend && linearTrend(s.points, range?.start, range?.end);
    return trend ? [{ series: s, trend }] : [];
  });
  const option = timeChartOption(props, theme, trends);
  // Before the zoom reset, so the reset applies to the new data.
  useChartOption(chart, option);
  const zoom = useZoomReset(chart, dataKey(props.series));
  const { onSelect } = props;

  useEffect(() => {
    if (!chart || !onSelect) return;
    const click = (e: { seriesId?: string; dataIndex: number }) => {
      if (e.seriesId) onSelect(e.seriesId, e.dataIndex);
    };
    chart.on("click", "series", click);
    return () => {
      if (!chart.isDisposed()) chart.off("click", click);
    };
  }, [chart, onSelect]);

  const { formatTrend } = props;
  const several = props.series.length > 1;
  const trendText = formatTrend
    ? trends
        .map(({ series, trend }) => {
          const rate = formatTrend(trend.perDay);
          return several
            ? t("ui.chart.seriesTrend", { series: series.label, rate })
            : t("ui.chart.trend", { rate });
        })
        .join(", ")
    : "";
  const span = range ?? seriesSpan(props.series);
  return (
    <>
      <ChartFrame
        label={props.label}
        height={props.height}
        chartRef={setEl}
        range={span && formatSpan(span)}
        onReset={zoom.zoomed ? zoom.reset : undefined}
      />
      {several && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm text-ink-muted">
          {props.series.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ background: theme.colors[s.color] }}
              />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      {formatTrend && trends.length > 0 && (
        <p className="tabular pt-1 text-sm text-ink-muted">
          {zoom.zoomed
            ? t("ui.chart.trendInRange", { trends: trendText })
            : trendText}
        </p>
      )}
    </>
  );
}

/**
 * Changes when other data is shown, e.g. another metric or period: the zoom
 * then goes back to the full range, since the old window may not even
 * overlap the new data.
 */
function dataKey(series: readonly TimeSeries[]) {
  return series
    .map(
      (s) =>
        `${s.id}:${s.points.length}:${s.points[0]?.t}:${s.points.at(-1)?.t}`,
    )
    .join();
}

const TREND_SUFFIX = ":trend";

function timeChartOption(
  props: TimeChartProps,
  theme: ChartTheme,
  trends: { series: TimeSeries; trend: Trend }[],
) {
  const byId = new Map(props.series.map((s) => [s.id, s]));
  const several = props.series.length > 1;
  return {
    ...baseOption(theme),
    grid: grid(true),
    xAxis: timeAxis(theme),
    yAxis: { ...valueAxis(theme, props.formatValue), scale: true },
    dataZoom: zoomOptions(theme),
    tooltip: {
      ...tooltip(theme, "line"),
      formatter: (raw: unknown) => {
        const params = (Array.isArray(raw) ? raw : [raw]) as AxisParam[];
        const t = Number(params[0]?.axisValue);
        const bySeries = new Map<TimeSeries, TimePoint[]>();
        for (const p of params) {
          const s = p.seriesId ? byId.get(p.seriesId) : undefined;
          const point = s?.points[p.dataIndex];
          if (!s || !point) continue;
          bySeries.set(s, [...(bySeries.get(s) ?? []), point]);
        }
        return tooltipHtml(
          theme,
          props.formatTime(t),
          [...bySeries].flatMap(([s, points]) =>
            points
              .sort((a, b) => b.v - a.v)
              .map((point) => ({
                ...(several && {
                  color: theme.colors[s.color],
                  label: s.label,
                }),
                value: props.formatValue(point.v),
                detail: point.detail,
              })),
          ),
        );
      },
    },
    series: [
      ...props.series.map((s) => seriesOption(s, theme)),
      ...trends.map(({ series, trend }) =>
        trendOption(series, trend, theme, several),
      ),
    ],
  };
}

/**
 * A lone series' trend is neutral, so it reads apart from the colored line;
 * with several series it takes its series' color to say whose it is.
 */
function trendOption(
  s: TimeSeries,
  trend: Trend,
  theme: ChartTheme,
  several: boolean,
): LineSeriesOption {
  return {
    id: `${s.id}${TREND_SUFFIX}`,
    type: "line",
    data: [
      [trend.from.t, trend.from.v],
      [trend.to.t, trend.to.v],
    ],
    showSymbol: false,
    silent: true,
    z: 1,
    lineStyle: {
      color: theme.colors[several ? s.color : "ink-muted"],
      width: 2,
      type: [6, 4],
      opacity: several ? 0.6 : 0.9,
    },
    emphasis: { disabled: true },
  };
}

function seriesOption(
  s: TimeChartProps["series"][number],
  theme: ChartTheme,
): LineSeriesOption | ScatterSeriesOption {
  const color = theme.colors[s.color];
  const data = s.points.map((p) => [p.t, p.v]);
  if (s.kind === "points") {
    return {
      id: s.id,
      name: s.label,
      type: "scatter",
      data,
      symbolSize: 6,
      itemStyle: { color, opacity: 0.55 },
      emphasis: { scale: 1.6, itemStyle: { opacity: 1 } },
    };
  }
  return {
    id: s.id,
    name: s.label,
    type: "line",
    data,
    symbol: "circle",
    symbolSize: 5,
    showSymbol: true,
    lineStyle: { color, width: 2 },
    itemStyle: { color },
    emphasis: { scale: 1.8, lineStyle: { width: 2 } },
  };
}
