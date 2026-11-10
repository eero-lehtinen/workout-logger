import type { BarChartProps, TimeChartProps } from "./types.ts";

// Placeholders until the charting spike picks a library
// (docs/plans/phase-7.md). Each spike branch replaces this file.

export function TimeChart(props: TimeChartProps) {
  return <Placeholder label={props.label} height={props.height} />;
}

export function BarChart(props: BarChartProps) {
  return <Placeholder label={props.label} height={props.height} />;
}

function Placeholder(props: { label: string; height: number | undefined }) {
  return (
    <div
      role="img"
      aria-label={props.label}
      style={{ height: props.height ?? 240 }}
      className="rounded-xl ring-1 ring-rule"
    />
  );
}

export type * from "./types.ts";
