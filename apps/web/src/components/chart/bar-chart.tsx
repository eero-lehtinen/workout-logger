import type { BarSeriesOption } from "echarts/charts";
import { useState } from "react";
import { ChartFrame } from "./frame.tsx";
import {
  alpha,
  axisText,
  baseOption,
  grid,
  timeAxis,
  tooltip,
  tooltipHtml,
  valueAxis,
  zoomOptions,
} from "./options.ts";
import { type ChartTheme, seriesColor, useChartTheme } from "./theme.ts";
import type { BarChartProps } from "./types.ts";
import { useChartOption, useEChart, useZoomReset } from "./use-echart.ts";

const HALF_WEEK = 3.5 * 24 * 3600_000;

interface AxisParam {
  axisValue?: number | string;
  dataIndex: number;
}

export default function EChartsBarChart(props: BarChartProps) {
  const theme = useChartTheme();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const chart = useEChart(el);
  const option = barChartOption(props, theme);
  const zoom = useZoomReset(chart, props.xKind);
  useChartOption(chart, option);

  return (
    <ChartFrame
      label={props.label}
      height={props.height}
      chartRef={setEl}
      onReset={zoom.zoomed ? zoom.reset : undefined}
    />
  );
}

function barChartOption(props: BarChartProps, theme: ChartTheme) {
  const time = props.xKind === "time";
  const color = theme.colors[props.color ?? seriesColor(0)];
  const muted = theme.colors["ink-muted"];
  const series: BarSeriesOption = {
    id: "bars",
    type: "bar",
    data: time ? props.bars.map((b) => [b.x, b.v]) : props.bars.map((b) => b.v),
    itemStyle: { color, borderRadius: [2, 2, 0, 0] },
    barMaxWidth: 28,
    barCategoryGap: time ? "25%" : "30%",
    emphasis: { disabled: true },
    ...(props.reference && {
      markLine: {
        silent: true,
        symbol: "none",
        lineStyle: { color: muted, type: [4, 3], width: 1 },
        label: {
          ...axisText(theme),
          position: "insideEndTop",
          formatter: props.reference.label,
          backgroundColor: alpha(theme.background, 0.85),
          padding: [1, 4],
          borderRadius: 3,
        },
        data: [{ yAxis: props.reference.value }],
      },
    }),
  };
  return {
    ...baseOption(theme),
    // `x` of a time bar is a UTC midnight: local time could shift it a day.
    useUTC: true,
    grid: grid(time),
    xAxis: time
      ? {
          ...timeAxis(theme),
          // Room for half of the first and last bar.
          min: (e: { min: number }) => e.min - HALF_WEEK,
          max: (e: { max: number }) => e.max + HALF_WEEK,
        }
      : {
          type: "category",
          data: props.bars.map((b) => props.formatX(b.x)),
          axisLine: { lineStyle: { color: theme.rule } },
          axisTick: { show: false },
          axisLabel: { ...axisText(theme), hideOverlap: true },
        },
    yAxis: {
      ...valueAxis(theme, props.formatTick ?? props.formatValue),
      minInterval: 1,
    },
    ...(time && { dataZoom: zoomOptions(theme) }),
    tooltip: {
      ...tooltip(theme, time ? "line" : "shadow"),
      formatter: (raw: unknown) => {
        const params = (Array.isArray(raw) ? raw : [raw]) as AxisParam[];
        const bar = params[0] && props.bars[params[0].dataIndex];
        if (!bar) return "";
        return tooltipHtml(theme, props.formatX(bar.x), [
          { value: props.formatValue(bar.v) },
        ]);
      },
    },
    series: [series],
  };
}
