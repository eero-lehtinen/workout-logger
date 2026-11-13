import type { Meta, StoryObj } from "@storybook/react-vite";
import { use } from "echarts/core";
import { LabelLayout } from "echarts/features";
import { useEffect, useState } from "react";
import { expect, within } from "storybook/test";
import { ChartFrame } from "./frame.tsx";
import { BarChart, TimeChart, type TimePoint } from "./index.tsx";
import {
  axisText,
  baseOption,
  timeAxis,
  tooltip,
  tooltipHtml,
  valueAxis,
  zoomOptions,
} from "./options.ts";
import { currentWindow } from "./pinch.ts";
import { type ChartColor, useChartTheme } from "./theme.ts";
import { useChartOption, useEChart } from "./use-echart.ts";

export default {
  title: "Components/Chart",
  decorators: [
    (Story) => (
      <div className="bg-chalk p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

const DAY = 24 * 3600_000;
const END = Date.UTC(2026, 9, 30);

/** Deterministic noise, so screenshots don't change between runs. */
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A lift trained about twice a week for `years`, with a slow climb. */
function sessions(seed: number, years: number, from: number, to: number) {
  const rnd = random(seed);
  const points: TimePoint[] = [];
  const start = END - years * 365 * DAY;
  for (let t = start; t <= END; t += (2 + Math.floor(rnd() * 4)) * DAY) {
    const progress = (t - start) / (END - start);
    const v = from + (to - from) * Math.sqrt(progress) + (rnd() - 0.5) * 6;
    points.push({ t: t + 18 * 3600_000, v: Math.round(v * 2) / 2 });
  }
  return points;
}

/** Every set of each session: several points per time, below the best. */
function sets(best: readonly TimePoint[]) {
  const rnd = random(7);
  return best.flatMap((p) =>
    [0, 1, 2].map((i) => ({ t: p.t, v: p.v - i * 2 - rnd() * 3 })),
  );
}

function bodyWeight() {
  const rnd = random(3);
  const points: TimePoint[] = [];
  let v = 82;
  for (let t = END - 3 * 365 * DAY; t <= END; t += DAY) {
    v += (rnd() - 0.52) * 0.3;
    if (rnd() < 0.6) points.push({ t: t + 7 * 3600_000, v });
  }
  return points;
}

const kg = (v: number) =>
  `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(v)} kg`;
const date = (t: number) =>
  new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(t);

const bench = sessions(1, 5, 70, 110);

export const Line: StoryObj = {
  render: () => (
    <TimeChart
      label="Best e1RM"
      height={260}
      series={[
        {
          id: "e1rm",
          label: "Best e1RM",
          points: bench,
          kind: "line",
          color: "ink",
        },
      ]}
      formatValue={kg}
      formatTime={date}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("img", { name: "Best e1RM" }),
    ).toBeVisible();
  },
};

/** About 1000 points, three per time. */
export const EverySet: StoryObj = {
  render: () => (
    <TimeChart
      label="Every set's e1RM"
      height={260}
      series={[
        {
          id: "sets",
          label: "Set e1RM",
          points: sets(bench),
          kind: "points",
          color: "ink",
        },
      ]}
      formatValue={kg}
      formatTime={date}
    />
  ),
};

const weeks = (() => {
  const rnd = random(11);
  const monday = END - 4 * DAY;
  return Array.from({ length: 250 }, (_, i) => ({
    x: monday - (249 - i) * 7 * DAY,
    v: Math.max(0, Math.round(2.6 + (rnd() - 0.5) * 3.5)),
  }));
})();
const average = weeks.reduce((sum, w) => sum + w.v, 0) / weeks.length;

export const WeeklyBars: StoryObj = {
  render: () => (
    <BarChart
      label="Sessions per week"
      xKind="time"
      height={180}
      bars={weeks}
      formatX={(x) => `Week of ${date(x)}`}
      formatValue={(v) => `${v} ${v === 1 ? "session" : "sessions"}`}
      formatTick={String}
      reference={{ value: average, label: `Average ${average.toFixed(1)}` }}
    />
  ),
};

export const CategoryBars: StoryObj = {
  render: () => (
    <BarChart
      label="Days between sessions"
      xKind="category"
      height={160}
      color="ink-muted"
      bars={[1, 2, 3, 4, 5, 6, 7].map((d) => ({
        x: d,
        v: [40, 90, 60, 25, 9, 4, 6][d - 1] ?? 0,
      }))}
      formatX={(x) => (x === 7 ? "7+" : String(x))}
      formatValue={(v) => `${v} times`}
      formatTick={String}
    />
  ),
};

// Measurement chart prototypes: built directly on ECharts, not on the chart API.

// Moves overlapping end labels apart.
use([LabelLayout]);

/**
 * Body weight above e1RM: one ECharts instance with two grids. The linked
 * axis pointer syncs the crosshair, and one inside zoom and one slider drive
 * both x axes. The grids get a fixed left edge, since grids that fit their
 * own labels would not line up.
 */
function StackedPanels() {
  const theme = useChartTheme();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const chart = useEChart(el);
  const weight = bodyWeight();
  const e1rm = sessions(5, 3, 90, 120);
  const left = 52;
  const option = {
    ...baseOption(theme),
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    grid: [
      { left, right: 4, top: 10, height: 130, outerBoundsMode: "none" },
      { left, right: 4, top: 170, bottom: 58, outerBoundsMode: "none" },
    ],
    xAxis: [
      { ...timeAxis(theme), gridIndex: 0, axisLabel: { show: false } },
      { ...timeAxis(theme), gridIndex: 1 },
    ],
    yAxis: [
      { ...valueAxis(theme, kg), gridIndex: 0, scale: true, splitNumber: 3 },
      { ...valueAxis(theme, kg), gridIndex: 1, scale: true, splitNumber: 3 },
    ],
    dataZoom: zoomOptions(theme, [0, 1]).map((z) =>
      z.type === "slider" ? { ...z, left } : z,
    ),
    tooltip: {
      ...tooltip(theme, "line"),
      formatter: (raw: unknown) => {
        const params = raw as {
          axisValue: number;
          seriesName: string;
          color: string;
          value: [number, number];
        }[];
        return tooltipHtml(
          theme,
          date(Number(params[0]?.axisValue)),
          params.map((p) => ({
            color: p.color,
            label: p.seriesName,
            value: kg(p.value[1]),
          })),
        );
      },
    },
    series: [
      {
        id: "weight",
        name: "Body weight",
        type: "line",
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: weight.map((p) => [p.t, p.v]),
        showSymbol: false,
        lineStyle: { color: theme.colors["day-2"], width: 2 },
        itemStyle: { color: theme.colors["day-2"] },
      },
      {
        id: "e1rm",
        name: "Squat e1RM",
        type: "line",
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: e1rm.map((p) => [p.t, p.v]),
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { color: theme.colors.ink, width: 2 },
        itemStyle: { color: theme.colors.ink },
      },
    ],
  };
  useChartOption(chart, option);
  return (
    <ChartFrame
      label="Body weight and squat e1RM"
      height={400}
      chartRef={setEl}
    />
  );
}

export const Phase8Stacked: StoryObj = {
  render: () => <StackedPanels />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("img", {
        name: "Body weight and squat e1RM",
      }),
    ).toBeVisible();
  },
};

const LIFTS: {
  id: string;
  label: string;
  color: ChartColor;
  points: TimePoint[];
}[] = [
  {
    id: "bench",
    label: "Bench",
    color: "day-1",
    points: sessions(21, 4, 70, 105),
  },
  {
    id: "squat",
    label: "Squat",
    color: "day-2",
    points: sessions(22, 4, 90, 140),
  },
  {
    id: "deadlift",
    label: "Deadlift",
    color: "day-4",
    points: sessions(23, 4, 110, 160),
  },
];

/**
 * Several lifts as % change from the start of the visible range. A zoom
 * changes the range, so the zoom event recomputes the series from the
 * window's start; the y axis then fits the visible data (`filterMode:
 * "filter"`).
 */
function NormalizedOverlay() {
  const theme = useChartTheme();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const chart = useEChart(el);
  const [from, setFrom] = useState(0);
  const pct = new Intl.NumberFormat(undefined, {
    style: "percent",
    signDisplay: "exceptZero",
    maximumFractionDigits: 0,
  });
  const normalized = LIFTS.map((l) => {
    const base = l.points.find((p) => p.t >= from)?.v ?? 1;
    return l.points.map((p) => [p.t, (p.v / base - 1) * 100] as const);
  });
  const option = {
    ...baseOption(theme),
    grid: { left: 0, right: 60, top: 10, bottom: 36, outerBoundsMode: "same" },
    xAxis: timeAxis(theme),
    yAxis: { ...valueAxis(theme, (v) => pct.format(v / 100)), scale: true },
    dataZoom: zoomOptions(theme),
    tooltip: {
      ...tooltip(theme, "line"),
      // The axis tooltip lists only series with a point at the hovered time,
      // and lifts are trained on different days: show each lift's latest.
      formatter: (raw: unknown) => {
        const t = Number((raw as { axisValue: number }[])[0]?.axisValue);
        return tooltipHtml(
          theme,
          date(t),
          LIFTS.flatMap((l, i) => {
            const v = normalized[i]?.findLast((p) => p[0] <= t)?.[1];
            return v === undefined
              ? []
              : [
                  {
                    color: theme.colors[l.color],
                    label: l.label,
                    value: pct.format(v / 100),
                  },
                ];
          }),
        );
      },
    },
    series: LIFTS.map((l, i) => {
      return {
        id: l.id,
        name: l.label,
        type: "line",
        data: normalized[i],
        showSymbol: false,
        lineStyle: { color: theme.colors[l.color], width: 2 },
        itemStyle: { color: theme.colors[l.color] },
        endLabel: { show: true, ...axisText(theme), formatter: l.label },
        labelLayout: { moveOverlap: "shiftY" },
      };
    }),
  };
  useChartOption(chart, option);
  useEffect(() => {
    if (!chart) return;
    const onZoom = () => setFrom(currentWindow(chart)?.startValue ?? 0);
    chart.on("datazoom", onZoom);
    return () => {
      if (!chart.isDisposed()) chart.off("datazoom", onZoom);
    };
  }, [chart]);
  return <ChartFrame label="Change in e1RM" height={300} chartRef={setEl} />;
}

export const Phase8Normalized: StoryObj = {
  render: () => <NormalizedOverlay />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("img", { name: "Change in e1RM" }),
    ).toBeVisible();
  },
};
