import { lazy, Suspense } from "react";
import { ChartFrame } from "./frame.tsx";
import type { BarChartProps, TimeChartProps } from "./types.ts";

// ECharts is loaded only by screens that draw a chart.
const LazyTimeChart = lazy(() => import("./time-chart.tsx"));
const LazyBarChart = lazy(() => import("./bar-chart.tsx"));

// Fallbacks keep the range row's space, so the page doesn't shift on load.

export function TimeChart(props: TimeChartProps) {
  return (
    <Suspense
      fallback={
        <ChartFrame label={props.label} height={props.height} range="" />
      }
    >
      <LazyTimeChart {...props} />
    </Suspense>
  );
}

export function BarChart(props: BarChartProps) {
  return (
    <Suspense
      fallback={
        <ChartFrame
          label={props.label}
          height={props.height}
          range={props.xKind === "time" ? "" : undefined}
        />
      }
    >
      <LazyBarChart {...props} />
    </Suspense>
  );
}

export type * from "./types.ts";
