import { clsx } from "clsx";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import type { ChartHeight } from "./types.ts";

export const DEFAULT_HEIGHT = 240;

/**
 * The chart's box. A zoomable chart's axis labels don't say which year or
 * days are in view, so `range` states them in a row above the box. The zoom
 * reset button goes in that row too: `role="img"` can't contain controls,
 * and in the row it doesn't cover the plot.
 */
export function ChartFrame(props: {
  label: string;
  height: ChartHeight | undefined;
  chartRef?: Ref<HTMLDivElement>;
  range?: string | undefined;
  onReset?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const fill = props.height === "fill";
  const box = (
    <div
      className={clsx("relative", fill && "min-h-0 flex-1")}
      style={fill ? undefined : { height: props.height ?? DEFAULT_HEIGHT }}
    >
      <div
        ref={props.chartRef}
        role="img"
        aria-label={props.label}
        className="size-full touch-pan-y"
      />
    </div>
  );
  if (props.range === undefined && !props.onReset) return box;
  return (
    <>
      <div className="flex h-5 shrink-0 items-center justify-between gap-2 text-xs">
        <span className="tabular truncate text-ink-muted">{props.range}</span>
        {props.onReset && (
          // The row is 20 px; the pseudo-element makes a finger-sized target,
          // above the chart's top padding.
          <button
            type="button"
            className="relative z-10 shrink-0 font-medium text-ink underline underline-offset-2 after:absolute after:-inset-x-2 after:-inset-y-3"
            onClick={props.onReset}
          >
            {t("ui.chart.showAll")}
          </button>
        )}
      </div>
      {box}
    </>
  );
}
