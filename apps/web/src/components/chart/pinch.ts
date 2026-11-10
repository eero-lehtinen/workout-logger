import type { ECharts } from "echarts/core";
import { MIN_ZOOM_SPAN } from "./options.ts";

interface Window {
  startValue: number;
  endValue: number;
  start: number;
  end: number;
}

interface Pinch {
  distance: number;
  /** The time under the fingers' midpoint when the pinch started. */
  anchor: number;
  window: Window;
  /** Pixels of the window's ends; the plot doesn't move during a pinch. */
  left: number;
  right: number;
}

/**
 * Two-finger zoom of the x axis. ECharts' own pinch zooms a fixed 10% per
 * touchmove, so how far it zooms depends on how fast the fingers move; this
 * one keeps the time under the fingers and scales by their distance. The
 * events are stopped before ECharts sees them.
 */
export function attachPinchZoom(el: HTMLElement, chart: ECharts) {
  let pinch: Pinch | null = null;

  const move = (e: TouchEvent) => {
    const [a, b] = [e.touches[0], e.touches[1]];
    if (e.touches.length !== 2 || !a || !b) {
      pinch = null;
      return;
    }
    const window = currentWindow(chart);
    if (!window) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const mid = (a.clientX + b.clientX) / 2 - rect.left;
    const distance = Math.max(
      24,
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
    );
    if (!pinch) {
      const left = chart.convertToPixel({ xAxisIndex: 0 }, window.startValue);
      const right = chart.convertToPixel({ xAxisIndex: 0 }, window.endValue);
      const f = (mid - left) / (right - left);
      pinch = {
        distance,
        anchor: window.startValue + f * (window.endValue - window.startValue),
        window,
        left,
        right,
      };
      return;
    }
    const w = pinch.window;
    const full = fullExtent(w);
    const span = Math.min(
      full[1] - full[0],
      Math.max(
        MIN_ZOOM_SPAN,
        ((w.endValue - w.startValue) * pinch.distance) / distance,
      ),
    );
    const f = (mid - pinch.left) / (pinch.right - pinch.left);
    const start = Math.min(
      Math.max(full[0], pinch.anchor - f * span),
      full[1] - span,
    );
    chart.dispatchAction({
      type: "dataZoom",
      startValue: start,
      endValue: start + span,
    });
  };
  const end = (e: TouchEvent) => {
    if (e.touches.length < 2) pinch = null;
  };

  el.addEventListener("touchmove", move, { capture: true, passive: false });
  el.addEventListener("touchend", end, { capture: true });
  el.addEventListener("touchcancel", end, { capture: true });
  return () => {
    el.removeEventListener("touchmove", move, { capture: true });
    el.removeEventListener("touchend", end, { capture: true });
    el.removeEventListener("touchcancel", end, { capture: true });
  };
}

export function currentWindow(chart: ECharts): Window | undefined {
  const zooms = (chart.getOption() as { dataZoom?: Partial<Window>[] })
    .dataZoom;
  const z = zooms?.[0];
  if (
    z?.startValue === undefined ||
    z.endValue === undefined ||
    z.start === undefined ||
    z.end === undefined
  ) {
    return undefined;
  }
  return {
    startValue: z.startValue,
    endValue: z.endValue,
    start: z.start,
    end: z.end,
  };
}

/** The whole axis range, from the window and its percentages. */
function fullExtent(w: Window): [number, number] {
  const span = ((w.endValue - w.startValue) * 100) / (w.end - w.start || 100);
  const min = w.startValue - (span * w.start) / 100;
  return [min, min + span];
}
