import type {
  DataZoomComponentOption,
  GridComponentOption,
  TooltipComponentOption,
  XAXisComponentOption,
  YAXisComponentOption,
} from "echarts";
import { echarts } from "./echarts.ts";
import type { ChartTheme } from "./theme.ts";

/* Shared look of every chart: the theme's tokens on ECharts' options. */

const SLIDER_HEIGHT = 22;

export const MIN_ZOOM_SPAN = 30 * 24 * 3600_000;

export const alpha = (color: string, a: number) =>
  echarts.color.modifyAlpha(color, a) ?? color;

export function axisText(theme: ChartTheme) {
  return {
    color: theme.colors["ink-muted"],
    fontFamily: theme.font,
    fontSize: 12,
  };
}

export function baseOption(theme: ChartTheme) {
  return {
    animation: false,
    textStyle: { fontFamily: theme.font },
  };
}

/** The plot area; `zoomable` leaves room for the slider below it. */
export function grid(zoomable: boolean): GridComponentOption {
  return {
    left: 0,
    right: 4,
    top: 10,
    bottom: zoomable ? SLIDER_HEIGHT + 14 : 0,
    outerBoundsMode: "same",
    outerBoundsContain: "axisLabel",
  };
}

export function timeAxis(theme: ChartTheme): XAXisComponentOption {
  return {
    type: "time",
    min: "dataMin",
    max: "dataMax",
    axisLine: { lineStyle: { color: theme.rule } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: {
      ...axisText(theme),
      hideOverlap: true,
      // Zoomed to weeks, a bare "15" doesn't say which month.
      formatter: { day: "{MMM} {d}" },
    },
    axisPointer: { snap: true },
  };
}

export function valueAxis(
  theme: ChartTheme,
  formatValue: (v: number) => string,
): YAXisComponentOption {
  return {
    type: "value",
    splitNumber: 4,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: theme.rule, width: 1 } },
    axisLabel: { ...axisText(theme), formatter: (v: number) => formatValue(v) },
  };
}

export function tooltip(
  theme: ChartTheme,
  pointer: "line" | "shadow",
): TooltipComponentOption {
  return {
    trigger: "axis",
    confine: true,
    transitionDuration: 0,
    backgroundColor: theme.raised,
    borderColor: theme.rule,
    borderWidth: 1,
    padding: [6, 10],
    textStyle: {
      color: theme.colors.ink,
      fontFamily: theme.font,
      fontSize: 13,
    },
    extraCssText:
      "border-radius: 8px; box-shadow: 0 2px 8px rgb(0 0 0 / 0.15);",
    axisPointer:
      pointer === "line"
        ? {
            type: "line",
            lineStyle: {
              color: theme.colors["ink-muted"],
              width: 1,
              type: "solid",
            },
          }
        : { type: "shadow", shadowStyle: { color: alpha(theme.rule, 0.5) } },
  };
}

/**
 * Ctrl+wheel zoom, mouse drag pans, and a slider below the plot for both
 * (pinch is `attachPinchZoom`). A one-finger drag must not pan: it would fight the page's
 * vertical scroll, so on touch screens it moves the crosshair instead.
 * `preventDefaultMouseMove: false` matters even then, because ECharts calls
 * `preventDefault` on a drag before checking `moveOnMouseMove`.
 */
export function zoomOptions(
  theme: ChartTheme,
  xAxisIndex: number | number[] = 0,
): DataZoomComponentOption[] {
  const finePointer = matchMedia("(pointer: fine)").matches;
  const ink = theme.colors.ink;
  const muted = theme.colors["ink-muted"];
  return [
    {
      type: "inside",
      xAxisIndex,
      filterMode: "filter",
      zoomOnMouseWheel: "ctrl",
      moveOnMouseWheel: false,
      moveOnMouseMove: finePointer,
      preventDefaultMouseMove: false,
      minValueSpan: MIN_ZOOM_SPAN,
    },
    {
      type: "slider",
      xAxisIndex,
      filterMode: "filter",
      height: SLIDER_HEIGHT,
      bottom: 2,
      left: 2,
      right: 6,
      // On touch, a page scroll that starts on the slider would brush a
      // tiny range instead.
      brushSelect: finePointer,
      showDetail: false,
      borderColor: theme.rule,
      borderRadius: 6,
      backgroundColor: "transparent",
      fillerColor: alpha(ink, 0.08),
      dataBackground: {
        lineStyle: { color: muted, width: 1, opacity: 0.5 },
        areaStyle: { opacity: 0 },
      },
      selectedDataBackground: {
        lineStyle: { color: ink, width: 1, opacity: 0.7 },
        areaStyle: { opacity: 0 },
      },
      handleSize: "70%",
      handleStyle: { color: theme.raised, borderColor: muted, borderWidth: 1 },
      moveHandleSize: 0,
      brushStyle: { color: alpha(ink, 0.12) },
      emphasis: {
        handleStyle: { borderColor: ink },
      },
    },
  ];
}

/** HTML for a tooltip: a muted heading, then lines. */
export function tooltipHtml(
  theme: ChartTheme,
  heading: string,
  lines: {
    color?: string | undefined;
    label?: string | undefined;
    value: string;
  }[],
) {
  const enc = echarts.format.encodeHTML;
  const head = `<div style="color:${theme.colors["ink-muted"]};font-size:12px">${enc(heading)}</div>`;
  const body = lines
    .map((l) => {
      const dot = l.color
        ? `<span style="display:inline-block;width:8px;height:8px;border-radius:4px;margin-right:6px;background:${l.color}"></span>`
        : "";
      const label = l.label ? `${enc(l.label)} ` : "";
      return `<div style="font-variant-numeric:tabular-nums">${dot}${label}<b style="font-weight:600">${enc(l.value)}</b></div>`;
    })
    .join("");
  return head + body;
}
