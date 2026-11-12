import type { ECharts, EChartsCoreOption } from "echarts/core";
import { useEffect, useState } from "react";
import { useCurrentLanguage } from "../../i18n/index.ts";
import { echarts } from "./echarts.ts";
import { chartLocale } from "./locale.ts";
import { attachPinchZoom, currentWindow } from "./pinch.ts";
import { attachTouchTooltip, hideTooltip } from "./touch-tooltip.ts";

/**
 * An ECharts instance on `el`, sized to it, disposed with it.
 *
 * Page scrolling must keep working over a chart. ECharts' inside zoom calls
 * `preventDefault` on every wheel event over the plot, even when its zoom
 * needs a modifier key, so plain wheel events are stopped before they reach
 * the chart: the page scrolls, and ctrl+wheel (also a trackpad pinch) zooms.
 * Touch is handled by `touch-action: pan-y` on the element,
 * `preventDefaultMouseMove: false` on the inside zoom (see `zoomOptions`),
 * and our own pinch.
 */
export function useEChart(el: HTMLElement | null): ECharts | null {
  const [chart, setChart] = useState<ECharts | null>(null);
  const language = useCurrentLanguage();
  useEffect(() => {
    if (!el) return;
    const instance = echarts.init(el, null, { locale: chartLocale(language) });
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(el);
    const wheel = (e: Event) => {
      if (!(e as WheelEvent).ctrlKey) e.stopPropagation();
    };
    el.addEventListener("wheel", wheel, { capture: true });
    el.addEventListener("mousewheel", wheel, { capture: true });
    const detachPinch = attachPinchZoom(el, instance);
    const detachTooltip = attachTouchTooltip(el, instance);
    setChart(instance);
    return () => {
      detachTooltip();
      detachPinch();
      resize.disconnect();
      el.removeEventListener("wheel", wheel, { capture: true });
      el.removeEventListener("mousewheel", wheel, { capture: true });
      instance.dispose();
      setChart(null);
    };
  }, [el, language]);
  return chart;
}

/**
 * Applies `option` whenever it changes. Series are replaced, not merged, so
 * a removed series disappears; the zoom range is kept, since options never
 * set one.
 */
export function useChartOption(
  chart: ECharts | null,
  option: EChartsCoreOption,
) {
  useEffect(() => {
    chart?.setOption(option, { replaceMerge: ["series"] });
  }, [chart, option]);
}

/**
 * Whether the chart is zoomed in, and a way back to the full range. A new
 * `resetKey` (other data) also goes back to the full range and closes the
 * tooltip, which would describe the old data; so does a double click.
 */
export function useZoomReset(chart: ECharts | null, resetKey: string) {
  const [zoomed, setZoomed] = useState(false);
  const reset = () =>
    chart?.dispatchAction({ type: "dataZoom", start: 0, end: 100 });

  useEffect(() => {
    if (!chart) return;
    // The event carries percents or values, depending on what dispatched it.
    const onZoom = () => {
      const w = currentWindow(chart);
      setZoomed(!!w && (w.start > 0.01 || w.end < 99.99));
    };
    const onDoubleClick = () =>
      chart.dispatchAction({ type: "dataZoom", start: 0, end: 100 });
    chart.on("datazoom", onZoom);
    chart.getZr().on("dblclick", onDoubleClick);
    return () => {
      if (chart.isDisposed()) return;
      chart.off("datazoom", onZoom);
      chart.getZr().off("dblclick", onDoubleClick);
    };
  }, [chart]);

  useEffect(() => {
    if (!chart || !resetKey) return;
    chart.dispatchAction({ type: "dataZoom", start: 0, end: 100 });
    hideTooltip(chart);
  }, [chart, resetKey]);

  return { zoomed, reset };
}
