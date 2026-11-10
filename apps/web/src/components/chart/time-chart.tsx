import type { LineSeriesOption, ScatterSeriesOption } from "echarts/charts";
import type { ECharts } from "echarts/core";
import { useEffect, useState } from "react";
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
import { currentWindow } from "./pinch.ts";
import { type ChartTheme, useChartTheme } from "./theme.ts";
import { linearTrend, type Trend } from "./trend.ts";
import type { TimeChartProps, TimeSeries } from "./types.ts";
import { useChartOption, useEChart, useZoomReset } from "./use-echart.ts";

interface AxisParam {
  seriesId?: string;
  axisValue?: number | string;
  value?: unknown;
}

export default function EChartsTimeChart(props: TimeChartProps) {
  const theme = useChartTheme();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const chart = useEChart(el);
  const range = useVisibleRange(chart);
  const trends = props.series.flatMap((s) => {
    const trend = s.trend && linearTrend(s.points, range?.start, range?.end);
    return trend ? [{ series: s, trend }] : [];
  });
  const option = timeChartOption(props, theme, trends);
  const zoom = useZoomReset(chart, props.series.map((s) => s.id).join());
  const { onSelect } = props;
  useChartOption(chart, option);

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
  return (
    <>
      <ChartFrame
        label={props.label}
        height={props.height}
        chartRef={setEl}
        onReset={zoom.zoomed ? zoom.reset : undefined}
      />
      {formatTrend && trends.length > 0 && (
        <p className="tabular pt-1 text-sm text-ink-muted">
          {trends
            .map(
              ({ series, trend }) =>
                `${several ? `${series.label} trend` : "Trend"} ${formatTrend(trend.perDay)}`,
            )
            .join(", ")}
          {zoom.zoomed && " in the shown range"}
        </p>
      )}
    </>
  );
}

/** The x range in view, in epoch ms; null before the first zoom. */
function useVisibleRange(chart: ECharts | null) {
  const [range, setRange] = useState<{ start: number; end: number } | null>(
    null,
  );
  useEffect(() => {
    if (!chart) return;
    const onZoom = () => {
      const w = currentWindow(chart);
      setRange(w ? { start: w.startValue, end: w.endValue } : null);
    };
    chart.on("datazoom", onZoom);
    return () => {
      if (!chart.isDisposed()) chart.off("datazoom", onZoom);
    };
  }, [chart]);
  return range;
}

const TREND_SUFFIX = ":trend";

function timeChartOption(
  props: TimeChartProps,
  theme: ChartTheme,
  trends: { series: TimeSeries; trend: Trend }[],
) {
  const labels = new Map(props.series.map((s) => [s.id, s.label]));
  const colors = new Map(
    props.series.map((s) => [s.id, theme.colors[s.color]]),
  );
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
        // Points that share a time (every set's e1RM) come as one entry each.
        const bySeries = new Map<string, number[]>();
        for (const p of params) {
          if (!p.seriesId || p.seriesId.endsWith(TREND_SUFFIX)) continue;
          const v = (p.value as [number, number])[1];
          bySeries.set(p.seriesId, [...(bySeries.get(p.seriesId) ?? []), v]);
        }
        return tooltipHtml(
          theme,
          props.formatTime(t),
          [...bySeries].map(([id, values]) => ({
            ...(several && { color: colors.get(id), label: labels.get(id) }),
            value: values
              .sort((a, b) => b - a)
              .map(props.formatValue)
              .join(", "),
          })),
        );
      },
    },
    series: [
      ...props.series.map((s) => seriesOption(s, theme)),
      ...trends.map(({ series, trend }) => trendOption(series, trend, theme)),
    ],
  };
}

function trendOption(
  s: TimeSeries,
  trend: Trend,
  theme: ChartTheme,
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
      color: theme.colors[s.color],
      width: 2,
      type: [6, 4],
      opacity: 0.6,
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
