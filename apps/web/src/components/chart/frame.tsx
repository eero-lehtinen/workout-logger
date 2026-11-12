import { clsx } from "clsx";
import type { Ref } from "react";
import { Button } from "../button.tsx";
import type { ChartHeight } from "./types.ts";

export const DEFAULT_HEIGHT = 240;

/**
 * The chart's box. `role="img"` can't contain controls, so the zoom reset
 * button is its sibling.
 */
export function ChartFrame(props: {
  label: string;
  height: ChartHeight | undefined;
  chartRef?: Ref<HTMLDivElement>;
  onReset?: (() => void) | undefined;
}) {
  const fill = props.height === "fill";
  return (
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
      {props.onReset && (
        <Button
          size="sm"
          className="absolute top-0 right-1 shadow-sm"
          onClick={props.onReset}
        >
          Show all
        </Button>
      )}
    </div>
  );
}
