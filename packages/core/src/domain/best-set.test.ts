import { describe, expect, it } from "vitest";
import { bestSet, type RepCountGroup } from "./best-set.ts";

const group = (
  reps: number | null,
  maxWeightKg: number | null,
  more: Partial<RepCountGroup> = {},
): RepCountGroup => ({
  reps,
  maxWeightKg,
  maxDurationS: null,
  maxDistanceM: null,
  ...more,
});

const lifted = (weight_kg: number, reps: number) => ({
  weight_kg,
  reps,
  duration_s: null,
  distance_m: null,
});

describe("bestSet", () => {
  it("is null without groups", () => {
    expect(bestSet("weight_reps", [])).toBeNull();
  });

  it("takes the heaviest set by e1RM, within the rep cap", () => {
    const best = bestSet("weight_reps", [
      group(8, 100),
      group(3, 105),
      group(15, 110),
    ]);
    expect(best).toEqual({
      kind: "e1rm",
      value: 100 * (1 + 8 / 30),
      set: lifted(100, 8),
    });
    expect(
      bestSet("weight_reps", [group(8, 100), group(15, 110)], {
        e1rmRepCap: 15,
      })?.set,
    ).toEqual(lifted(110, 15));
  });

  it("gives an e1RM tie to fewer reps", () => {
    const best = bestSet("weight_reps", [
      group(5, 100),
      group(1, 100 + 50 / 3),
    ]);
    expect(best?.set?.reps).toBe(1);
  });

  it("falls back to the most reps at the heaviest weight above the cap", () => {
    const best = bestSet("weight_reps", [
      group(20, 60),
      group(15, 60),
      group(25, 50),
    ]);
    expect(best).toEqual({ kind: "weight", value: 60, set: lifted(60, 20) });
  });

  it("prefers added weight for bodyweight reps", () => {
    expect(
      bestSet("bodyweight_reps", [group(12, null), group(5, 10)])?.set,
    ).toEqual(lifted(10, 5));
    expect(bestSet("bodyweight_reps", [group(12, null), group(20, 5)])).toEqual(
      { kind: "weight", value: 5, set: lifted(5, 20) },
    );
  });

  it("takes the most reps when no set had added weight", () => {
    expect(bestSet("bodyweight_reps", [group(12, null), group(20, 0)])).toEqual(
      { kind: "reps", value: 20, set: null },
    );
    expect(bestSet("reps", [group(30, null), group(12, null)])).toEqual({
      kind: "reps",
      value: 30,
      set: null,
    });
  });

  it("takes the longest set and distance", () => {
    expect(bestSet("time", [group(null, null, { maxDurationS: 90 })])).toEqual({
      kind: "duration",
      value: 90,
      set: null,
    });
    expect(
      bestSet("distance_time", [
        group(null, null, { maxDistanceM: 5000, maxDurationS: 1500 }),
      ]),
    ).toEqual({ kind: "distance", value: 5000, set: null });
  });
});
