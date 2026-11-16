import type { TooltipComponentOption } from "echarts";
import type { ECharts } from "echarts/core";

/** Finger travel, in px, that makes a touch a gesture rather than a tap. */
const TAP_SLOP = 10;

export interface Touch {
  /** The first finger started on the plot, not the slider or the axes. */
  onPlot: boolean;
  /** A second finger came down: a pinch. */
  multi: boolean;
  /** The browser took the touch over to scroll the page. */
  scrolled: boolean;
  dx: number;
  dy: number;
}

/**
 * Whether the tooltip stays after the finger lifts. A tap, and a scrub
 * along the plot, keep it: both point at a value to read. A swipe that
 * scrolls the page, a pinch, or a drag on the slider only passes over the
 * plot, so the tooltip shows only while a finger is down.
 */
export function keepsTooltip(t: Touch) {
  if (t.multi || t.scrolled) return false;
  if (Math.hypot(t.dx, t.dy) <= TAP_SLOP) return true;
  return t.onPlot && Math.abs(t.dx) > Math.abs(t.dy);
}

/**
 * When the tooltip and its crosshair close. A mouse leaving the chart closes
 * them, but touch has no such event, so ECharts leaves them where the last
 * finger was. Here a tap or a scrub keeps them until a press anywhere else;
 * other touches show them only while a finger is down (`keepsTooltip`). A
 * zoom closes them too.
 */
export function attachTouchTooltip(el: HTMLElement, chart: ECharts) {
  const hide = () => hideTooltip(chart);
  let start: { x: number; y: number } | null = null;
  let touch: Touch | null = null;

  const touchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (e.touches.length > 1) {
      if (touch) touch.multi = true;
    } else if (t) {
      const box = el.getBoundingClientRect();
      start = { x: t.clientX, y: t.clientY };
      touch = {
        onPlot: chart.containPixel("grid", [
          t.clientX - box.left,
          t.clientY - box.top,
        ]),
        multi: false,
        scrolled: false,
        dx: 0,
        dy: 0,
      };
    }
  };
  const touchMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!touch || !start) return;
    if (e.touches.length > 1) touch.multi = true;
    else if (t) {
      touch.dx = t.clientX - start.x;
      touch.dy = t.clientY - start.y;
    }
  };
  const pointerCancel = (e: PointerEvent) => {
    if (touch && e.pointerType === "touch") touch.scrolled = true;
  };
  const touchEnd = (e: TouchEvent) => {
    if (e.touches.length > 0) return;
    // After ECharts has handled the same event, which would show them again.
    if (touch && !keepsTooltip(touch)) setTimeout(hide);
    start = null;
    touch = null;
  };
  const pressOutside = (e: PointerEvent) => {
    if (!el.contains(e.target as Node)) hide();
  };

  const capture = { capture: true, passive: true } as const;
  el.addEventListener("touchstart", touchStart, capture);
  el.addEventListener("touchmove", touchMove, capture);
  el.addEventListener("touchend", touchEnd, capture);
  el.addEventListener("touchcancel", touchEnd, capture);
  el.addEventListener("pointercancel", pointerCancel, capture);
  document.addEventListener("pointerdown", pressOutside, { capture: true });
  chart.on("datazoom", hide);
  return () => {
    el.removeEventListener("touchstart", touchStart, capture);
    el.removeEventListener("touchmove", touchMove, capture);
    el.removeEventListener("touchend", touchEnd, capture);
    el.removeEventListener("touchcancel", touchEnd, capture);
    el.removeEventListener("pointercancel", pointerCancel, capture);
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

/** Horizontal clearance from the pointer: about half a fingertip. */
const SIDE_GAP = 28;
const ABOVE_GAP = 16;

/**
 * Where the tooltip goes, in px from the chart's top left: beside the
 * pointer on the side with more room, and above it where the chart has
 * room. A finger covers its touch point and everything below it, so the
 * tooltip is never placed below the pointer, nor across it unless there is
 * no other room. One too wide to go beside the pointer goes above it, past
 * the chart's top if need be, but not past `minTop`, where it would be
 * clipped.
 */
export function tooltipPosition(
  [x, y]: [number, number],
  [width, height]: [number, number],
  viewWidth: number,
  minTop: number,
): [number, number] {
  const above = y - height - ABOVE_GAP;
  const top = Math.max(0, minTop, above);
  const right = x + SIDE_GAP;
  const left = x - SIDE_GAP - width;
  const fitsRight = right + width <= viewWidth;
  const fitsLeft = left >= 0;
  if (fitsRight && (!fitsLeft || x < viewWidth / 2)) return [right, top];
  if (fitsLeft) return [left, top];
  return [
    Math.max(0, Math.min(x - width / 2, viewWidth - width)),
    Math.max(minTop, above),
  ];
}

/**
 * Tooltip options for the chart in `el`, set once at init and kept by later
 * merges. The tooltip stays in `el` and overflows it upwards. `appendTo`
 * would avoid clipping by the scroll container, but zrender 6 keeps reusing
 * the chart-to-container transform from before the chart last moved, so
 * the tooltip lands off by however far the screen has scrolled since.
 */
export function tooltipPlacement(el: HTMLElement): TooltipComponentOption {
  return {
    position: (point, _params, _dom, _rect, size) =>
      tooltipPosition(
        point,
        size.contentSize,
        size.viewSize[0],
        clipTop(el) - el.getBoundingClientRect().top,
      ),
  };
}

/** The top of the window or of the nearest ancestor that clips `el`. */
function clipTop(el: HTMLElement) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (getComputedStyle(p).overflowY !== "visible")
      return Math.max(0, p.getBoundingClientRect().top);
  }
  return 0;
}
