import { lazy, Suspense } from "react";
import { ChartFrame } from "./frame.tsx";
import type { BarChartProps, TimeChartProps } from "./types.ts";

// ECharts is loaded only by screens that draw a chart.
const LazyTimeChart = lazy(() => import("./time-chart.tsx"));
const LazyBarChart = lazy(() => import("./bar-chart.tsx"));

export function TimeChart(props: TimeChartProps) {
  return (
    <Suspense
      fallback={<ChartFrame label={props.label} height={props.height} />}
    >
      <LazyTimeChart {...props} />
    </Suspense>
  );
}

export function BarChart(props: BarChartProps) {
  return (
    <Suspense
      fallback={<ChartFrame label={props.label} height={props.height} />}
    >
      <LazyBarChart {...props} />
    </Suspense>
  );
}

export type * from "./types.ts";
