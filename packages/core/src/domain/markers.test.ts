import { describe, expect, it } from "vitest";
import {
  explainPerformances,
  markPerformances,
  type SetValues,
} from "./markers.ts";
import { toKg } from "./units.ts";

const s = (weight_kg: number | null, reps: number | null): SetValues => ({
  weight_kg,
  reps,
  duration_s: null,
  distance_m: null,
});
const timed = (duration_s: number): SetValues => ({
  weight_kg: null,
  reps: null,
  duration_s,
  distance_m: null,
});
const cardio = (distance_m: number, duration_s: number): SetValues => ({
  weight_kg: null,
  reps: null,
  duration_s,
  distance_m,
});

/** Markers of the last performance. */
function last(...args: Parameters<typeof markPerformances>) {
  return markPerformances(...args).at(-1);
}

describe("weight_reps", () => {
  it("never marks PRs in the first session of an exercise", () => {
    expect(
      markPerformances("weight_reps", [[s(60, 8), s(70, 8), s(80, 8)]]),
    ).toEqual([[null, null, null]]);
  });

  it("marks a PR when the e1RM beats every earlier set, including earlier sets today", () => {
    const history = [[s(100, 5)], [s(100, 6), s(100, 7), s(100, 6)]];
    expect(last("weight_reps", history)).toEqual(["pr", "pr", null]);
  });

  it("does not mark a PR above the e1RM cap", () => {
    expect(last("weight_reps", [[s(100, 5)], [s(100, 20)]])).toEqual([
      "set_record",
    ]);
  });

  it("respects a custom cap", () => {
    expect(
      last("weight_reps", [[s(100, 5)], [s(100, 15)]], { e1rmRepCap: 15 }),
    ).toEqual(["pr"]);
  });

  it("gives ties no marker", () => {
    expect(last("weight_reps", [[s(100, 5)], [s(100, 5)]])).toEqual([null]);
  });

  it("doesn't create records from unit conversion", () => {
    const enteredInLb = toKg(225, "lb");
    expect(
      last("weight_reps", [[s(102.0582833, 5)], [s(enteredInLb, 5)]]),
    ).toEqual([null]);
  });

  it("marks a set record when the e1RM beats the reference set but not the PR", () => {
    const history = [[s(100, 8)], [s(90, 8), s(90, 6)], [s(80, 5), s(90, 7)]];
    expect(last("weight_reps", history)).toEqual([null, "set_record"]);
  });

  it("uses dominance when either set is above the cap", () => {
    // 15 vs 14 reps at the same weight: both above the cap.
    expect(last("weight_reps", [[s(60, 14)], [s(60, 15)]])).toEqual([
      "set_record",
    ]);
    // Reference below the cap, this set above it.
    expect(last("weight_reps", [[s(60, 10)], [s(60, 13)]])).toEqual([
      "set_record",
    ]);
    // More weight but fewer reps doesn't dominate.
    expect(last("weight_reps", [[s(60, 15)], [s(65, 13)]])).toEqual([
      "weight_increase",
    ]);
    // Equal on both is a tie.
    expect(last("weight_reps", [[s(60, 15)], [s(60, 15)]])).toEqual([null]);
  });

  it("marks a weight increase: more weight, fewer reps, no record", () => {
    expect(
      last("weight_reps", [
        [s(100, 10), s(100, 10)],
        [s(105, 6), s(105, 9)],
      ]),
    ).toEqual(["weight_increase", "pr"]);
  });

  it("prefers PR over set record over weight increase", () => {
    expect(last("weight_reps", [[s(100, 5)], [s(110, 5)]])).toEqual(["pr"]);
  });

  it("has no reference for sets beyond the previous set count", () => {
    expect(last("weight_reps", [[s(100, 5)], [s(90, 5), s(95, 5)]])).toEqual([
      null,
      null,
    ]);
  });

  it("judges each session against the history before it", () => {
    const marks = markPerformances("weight_reps", [
      [s(100, 5)],
      [s(110, 5)],
      [s(120, 5)],
      [s(105, 5)],
    ]);
    expect(marks).toEqual([[null], ["pr"], ["pr"], [null]]);
  });
});

describe("bodyweight_reps", () => {
  it("compares sets without added weight like reps", () => {
    const history = [
      [s(0, 8), s(0, 8)],
      [s(0, 10), s(0, 8)],
      [s(0, 9), s(0, 9)],
    ];
    expect(markPerformances("bodyweight_reps", history)).toEqual([
      [null, null],
      ["pr", null],
      [null, "set_record"],
    ]);
  });

  it("uses the added weight's e1RM when there is one", () => {
    expect(last("bodyweight_reps", [[s(10, 5)], [s(15, 5)]])).toEqual(["pr"]);
    // 25 × 1 (e1RM 25) doesn't beat 20 × 8 (e1RM 25.3), and has no reference set.
    expect(last("bodyweight_reps", [[s(20, 8)], [s(10, 8), s(25, 1)]])).toEqual(
      [null, null],
    );
    // 22.5 × 3 (e1RM 24.75) is heavier than 20 × 8 but not a record.
    expect(
      last("bodyweight_reps", [
        [s(20, 8), s(20, 8)],
        [s(20, 8), s(22.5, 3)],
      ]),
    ).toEqual([null, "weight_increase"]);
  });

  it("does not compare a set without added weight to weighted history", () => {
    expect(last("bodyweight_reps", [[s(10, 5)], [s(0, 20)]])).toEqual([null]);
  });
});

describe("other exercise types", () => {
  it("reps: compares reps, never marks weight increases", () => {
    expect(
      markPerformances("reps", [[s(null, 20)], [s(null, 25), s(5, 15)]]),
    ).toEqual([[null], ["pr", null]]);
    expect(
      last("reps", [
        [s(null, 20), s(null, 15)],
        [s(null, 19), s(null, 16)],
      ]),
    ).toEqual([null, "set_record"]);
  });

  it("time: compares duration", () => {
    expect(
      last("time", [
        [timed(60), timed(50)],
        [timed(70), timed(55)],
      ]),
    ).toEqual(["pr", "set_record"]);
  });

  it("distance_time: compares distance", () => {
    expect(
      last("distance_time", [[cardio(5000, 1500)], [cardio(5000, 1400)]]),
    ).toEqual([null]);
    expect(
      last("distance_time", [[cardio(5000, 1500)], [cardio(6000, 2000)]]),
    ).toEqual(["pr"]);
  });
});

describe("explainPerformances", () => {
  it("points a PR at the previous best set, wherever it was", () => {
    const history = [[s(100, 8)], [s(90, 8)], [s(102.5, 8)]];
    expect(explainPerformances("weight_reps", history).at(-1)).toEqual([
      {
        marker: "pr",
        measure: "e1rm",
        value: 102.5 * (1 + 8 / 30),
        compared: 100 * (1 + 8 / 30),
        against: { performance: 0, set: 0 },
      },
    ]);
  });

  it("points set records and weight increases at the reference set", () => {
    const history = [
      [s(120, 8), s(100, 7), s(100, 6)],
      [s(110, 5), s(100, 8), s(105, 4)],
    ];
    const [, record, increase] =
      explainPerformances("weight_reps", history).at(-1) ?? [];
    expect(record).toEqual({
      marker: "set_record",
      measure: "e1rm",
      value: 100 * (1 + 8 / 30),
      compared: 100 * (1 + 7 / 30),
      against: { performance: 0, set: 1 },
    });
    expect(increase).toEqual({
      marker: "weight_increase",
      measure: "weight",
      value: 105,
      compared: 100,
      against: { performance: 0, set: 2 },
    });
  });

  it("says when a set record above the e1RM cap is by weight and reps", () => {
    const history = [[s(60, 15)], [s(60, 16)]];
    expect(explainPerformances("weight_reps", history).at(-1)).toEqual([
      {
        marker: "set_record",
        measure: "weight_and_reps",
        value: null,
        compared: null,
        against: { performance: 0, set: 0 },
      },
    ]);
  });

  it("compares timed sets by duration", () => {
    const history = [[timed(40)], [timed(45)]];
    expect(explainPerformances("time", history).at(-1)?.[0]).toMatchObject({
      marker: "pr",
      measure: "duration",
      value: 45,
      compared: 40,
    });
  });
});
