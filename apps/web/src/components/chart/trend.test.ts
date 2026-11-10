import { describe, expect, it } from "vitest";
import { linearTrend } from "./trend.ts";

const DAY = 86_400_000;
const p = (day: number, v: number) => ({ t: day * DAY, v });

describe("linearTrend", () => {
  it("fits a line and gives its rate per day", () => {
    const trend = linearTrend([p(0, 100), p(10, 101), p(20, 102), p(30, 103)]);
    expect(trend?.perDay).toBeCloseTo(0.1);
    expect(trend?.from).toEqual({ t: 0, v: expect.closeTo(100) });
    expect(trend?.to).toEqual({ t: 30 * DAY, v: expect.closeTo(103) });
  });

  it("fits only the points in the range", () => {
    const points = [p(0, 50), p(10, 100), p(20, 100), p(30, 100)];
    expect(linearTrend(points, 5 * DAY)?.perDay).toBeCloseTo(0);
    expect(linearTrend(points)?.perDay).toBeGreaterThan(0);
  });

  it("has no trend for too few points or a single time", () => {
    expect(linearTrend([p(0, 1), p(1, 2)])).toBeNull();
    expect(linearTrend([p(0, 1), p(0, 2), p(0, 3)])).toBeNull();
  });
});
