import type { ECharts } from "echarts/core";

/** Finger travel, in px, that makes a touch a gesture rather than a tap. */
const TAP_SLOP = 10;

/**
 * When the tooltip and its crosshair close. A mouse leaving the chart closes
 * them, but touch has no such event, so ECharts leaves them where the last
 * finger was. Here a tap keeps them until a press anywhere else; any other
 * touch (a drag, a swipe that scrolls the page, a pinch, the slider) shows
 * them only while a finger is down. A zoom closes them too.
 */
export function attachTouchTooltip(el: HTMLElement, chart: ECharts) {
  const hide = () => hideTooltip(chart);
  let start: { x: number; y: number } | null = null;
  let gesture = false;

  const touchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (e.touches.length > 1) gesture = true;
    else if (t) {
      start = { x: t.clientX, y: t.clientY };
      gesture = false;
    }
  };
  const touchMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (e.touches.length > 1) gesture = true;
    else if (t && start) {
      const moved = Math.hypot(t.clientX - start.x, t.clientY - start.y);
      if (moved > TAP_SLOP) gesture = true;
    }
  };
  const touchEnd = (e: TouchEvent) => {
    if (e.touches.length > 0) return;
    // After ECharts has handled the same event, which would show them again.
    if (gesture) setTimeout(hide);
    start = null;
  };
  const pressOutside = (e: PointerEvent) => {
    if (!el.contains(e.target as Node)) hide();
  };

  const capture = { capture: true, passive: true } as const;
  el.addEventListener("touchstart", touchStart, capture);
  el.addEventListener("touchmove", touchMove, capture);
  el.addEventListener("touchend", touchEnd, capture);
  el.addEventListener("touchcancel", touchEnd, capture);
  document.addEventListener("pointerdown", pressOutside, { capture: true });
  chart.on("datazoom", hide);
  return () => {
    el.removeEventListener("touchstart", touchStart, capture);
    el.removeEventListener("touchmove", touchMove, capture);
    el.removeEventListener("touchend", touchEnd, capture);
    el.removeEventListener("touchcancel", touchEnd, capture);
    document.removeEventListener("pointerdown", pressOutside, {
      capture: true,
    });
    if (!chart.isDisposed()) chart.off("datazoom", hide);
  };
}

/** The tooltip and its crosshair are separate: both must be hidden. */
export function hideTooltip(chart: ECharts) {
  chart.dispatchAction({ type: "hideTip" });
  chart.dispatchAction({ type: "updateAxisPointer", currTrigger: "leave" });
}
