import { describe, expect, it } from "vitest";
import { seriesSpan, weeksSpan } from "./range.ts";
import type { TimeSeries } from "./types.ts";

const DAY = 86_400_000;
const WEEK = 7 * DAY;

const series = (id: string, times: number[]): TimeSeries => ({
  id,
  label: id,
  points: times.map((t) => ({ t, v: 1 })),
  kind: "line",
  color: "ink",
});

describe("seriesSpan", () => {
  it("spans every series' first to last point", () => {
    expect(
      seriesSpan([series("a", [5, 9]), series("b", [2, 7]), series("c", [])]),
    ).toEqual({ start: 2, end: 9 });
  });

  it("is undefined without points", () => {
    expect(seriesSpan([series("a", [])])).toBeUndefined();
  });
});

describe("weeksSpan", () => {
  const bars = [0, 1, 2, 3].map((i) => ({ x: i * WEEK, v: 1 }));

  it("covers all weeks before a zoom, through the last week's end", () => {
    expect(weeksSpan(bars, null)).toEqual({ start: 0, end: 4 * WEEK - 1 });
  });

  it("covers the weeks whose start is in the window", () => {
    // The window is padded by half a week either side of the bars.
    expect(weeksSpan(bars, { start: 0.5 * WEEK, end: 2.5 * WEEK })).toEqual({
      start: WEEK,
      end: 3 * WEEK - 1,
    });
  });

  it("is undefined when no week starts in the window", () => {
    expect(
      weeksSpan(bars, { start: 0.2 * WEEK, end: 0.8 * WEEK }),
    ).toBeUndefined();
  });
});
