import { describe, expect, it } from "vitest";
import { keepsTooltip, type Touch, tooltipPosition } from "./touch-tooltip.ts";

const touch = (t: Partial<Touch>): Touch => ({
  onPlot: true,
  multi: false,
  scrolled: false,
  dx: 0,
  dy: 0,
  ...t,
});

describe("keepsTooltip", () => {
  it("keeps it after a tap, wherever it was", () => {
    expect(keepsTooltip(touch({ dx: 4, dy: 3 }))).toBe(true);
    expect(keepsTooltip(touch({ onPlot: false }))).toBe(true);
  });

  it("keeps it after a scrub along the plot", () => {
    expect(keepsTooltip(touch({ dx: -120, dy: 30 }))).toBe(true);
  });

  it("hides it after a scroll, a pinch, or a slider drag", () => {
    expect(keepsTooltip(touch({ dx: 10, dy: 80 }))).toBe(false);
    expect(keepsTooltip(touch({ dx: 60, dy: 20, scrolled: true }))).toBe(false);
    expect(keepsTooltip(touch({ dx: 60, multi: true }))).toBe(false);
    expect(keepsTooltip(touch({ dx: 60, onPlot: false }))).toBe(false);
  });

  it("hides it after a pinch whose first finger stayed put", () => {
    expect(keepsTooltip(touch({ multi: true }))).toBe(false);
  });
});

describe("tooltipPosition", () => {
  const size: [number, number] = [140, 60];
  const place = (
    point: [number, number],
    s: [number, number] = size,
    minTop = -500,
  ) => tooltipPosition(point, s, 360, minTop);

  it("goes above the pointer, on the side with more room", () => {
    expect(place([100, 200])).toEqual([128, 124]);
    expect(place([300, 200])).toEqual([132, 124]);
  });

  it("stays beside the pointer when there is no room above", () => {
    const [x, y] = place([100, 30]);
    expect(y).toBe(0);
    expect(x).toBeGreaterThan(100);
  });

  it("takes the side that fits when the pointer is past the middle", () => {
    expect(place([200, 200])).toEqual([32, 124]);
    expect(place([150, 200], [170, 60])).toEqual([178, 124]);
  });

  it("goes above the chart when too wide to go beside the pointer", () => {
    expect(place([180, 30], [220, 90])).toEqual([70, -76]);
    expect(place([20, 30], [380, 90])).toEqual([0, -76]);
  });

  it("stays below the clipping edge", () => {
    expect(place([180, 30], [220, 90], -40)).toEqual([70, -40]);
    // The chart's top 100 px are scrolled out of view.
    expect(place([100, 120], size, 100)).toEqual([128, 100]);
  });
});
