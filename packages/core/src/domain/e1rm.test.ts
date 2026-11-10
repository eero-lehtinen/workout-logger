import { describe, expect, it } from "vitest";
import { DEFAULT_E1RM_REP_CAP, estimateOneRepMax } from "./e1rm.ts";

describe("estimateOneRepMax", () => {
  it("returns the weight itself for a single", () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
  });

  it("applies Epley for multiple reps", () => {
    expect(estimateOneRepMax(100, 10)).toBeCloseTo(133.333, 3);
    expect(estimateOneRepMax(60, 5)).toBeCloseTo(70, 10);
  });

  it("is defined up to and including the default cap", () => {
    expect(DEFAULT_E1RM_REP_CAP).toBe(12);
    expect(estimateOneRepMax(100, 12)).toBeCloseTo(140, 10);
    expect(estimateOneRepMax(100, 13)).toBeUndefined();
  });

  it("respects a custom cap", () => {
    expect(estimateOneRepMax(100, 12, 10)).toBeUndefined();
    expect(estimateOneRepMax(100, 15, 15)).toBeCloseTo(150, 10);
  });

  it("is undefined for fewer than one or fractional reps", () => {
    expect(estimateOneRepMax(100, 0)).toBeUndefined();
    expect(estimateOneRepMax(100, -3)).toBeUndefined();
    expect(estimateOneRepMax(100, 2.5)).toBeUndefined();
  });
});
