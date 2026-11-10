import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  localDate,
  weekOf,
  weeksBetween,
} from "./calendar.ts";
import {
  daysBetweenSessions,
  GAP_BUCKET_LIMIT,
  muscleGroupFrequency,
  sessionsPerWeek,
} from "./frequency.ts";
import {
  exerciseRecords,
  historySeries,
  loggedWeights,
  type PerformanceSets,
} from "./history.ts";
import type { SetValues } from "./markers.ts";

const s = (weight_kg: number | null, reps: number | null): SetValues => ({
  weight_kg,
  reps,
  duration_s: null,
  distance_m: null,
});
const secs = (duration_s: number): SetValues => ({
  weight_kg: null,
  reps: null,
  duration_s,
  distance_m: null,
});

const DAY = 86_400_000;
const perf = (day: number, sets: SetValues[]): PerformanceSets => ({
  sessionId: `s${day}`,
  startedAt: day * DAY,
  tz: "UTC",
  sets,
});

describe("calendar dates", () => {
  it("takes the local date in the session's zone", () => {
    const at = Date.UTC(2026, 0, 5, 23, 30);
    expect(localDate(at, "UTC")).toBe("2026-01-05");
    expect(localDate(at, "Europe/Helsinki")).toBe("2026-01-06");
    expect(localDate(at, "America/New_York")).toBe("2026-01-05");
  });

  it("starts weeks on Monday or Sunday", () => {
    // 2026-01-07 is a Wednesday.
    expect(weekOf("2026-01-07", "monday")).toBe("2026-01-05");
    expect(weekOf("2026-01-07", "sunday")).toBe("2026-01-04");
    expect(weekOf("2026-01-05", "monday")).toBe("2026-01-05");
    expect(weekOf("2026-01-04", "monday")).toBe("2025-12-29");
    expect(weekOf("2026-01-04", "sunday")).toBe("2026-01-04");
  });

  it("counts days across DST changes and years", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2025-12-30", "2026-01-02")).toBe(3);
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(weeksBetween("2026-01-07", "2026-01-19", "monday")).toEqual([
      "2026-01-05",
      "2026-01-12",
      "2026-01-19",
    ]);
  });
});

describe("historySeries", () => {
  const history = [
    perf(1, [s(100, 5), s(100, 4)]),
    perf(3, [s(80, 15)]),
    perf(5, [s(105, 3), s(90, 8)]),
  ];

  it("plots the best e1RM per session and skips sessions without one", () => {
    expect(
      historySeries("weight_reps", history, "best_e1rm").map((p) => [
        p.sessionId,
        p.value,
      ]),
    ).toEqual([
      ["s1", 100 * (1 + 5 / 30)],
      ["s5", 105 * (1 + 3 / 30)],
    ]);
  });

  it("plots every set's e1RM at its session's start", () => {
    const points = historySeries("weight_reps", history, "set_e1rm");
    expect(points).toHaveLength(4);
    expect(points.filter((p) => p.at === 5 * DAY)).toHaveLength(2);
  });

  it("respects the e1RM cap", () => {
    expect(
      historySeries("weight_reps", history, "best_e1rm", { e1rmRepCap: 20 }),
    ).toHaveLength(3);
  });

  it("plots top weight, volume, and reps at a weight", () => {
    const values = (
      metric: Parameters<typeof historySeries>[2],
      weightKg?: number,
    ) =>
      historySeries("weight_reps", history, metric, {
        ...(weightKg !== undefined && { weightKg }),
      }).map((p) => p.value);
    expect(values("top_weight")).toEqual([100, 80, 105]);
    expect(values("volume")).toEqual([900, 1200, 1035]);
    expect(values("reps_at_weight", 100)).toEqual([5]);
    expect(values("reps_at_weight")).toEqual([]);
  });

  it("counts bodyweight reps only from sets without added weight", () => {
    const pullUps = [perf(1, [s(0, 12), s(10, 6)]), perf(2, [s(10, 8)])];
    expect(
      historySeries("bodyweight_reps", pullUps, "best_reps").map(
        (p) => p.value,
      ),
    ).toEqual([12]);
    expect(
      historySeries("bodyweight_reps", pullUps, "top_weight").map(
        (p) => p.value,
      ),
    ).toEqual([10, 10]);
  });

  it("plots durations of timed exercises", () => {
    const planks = [perf(1, [secs(40), secs(45)])];
    expect(historySeries("time", planks, "best_duration")[0]?.value).toBe(45);
    expect(historySeries("time", planks, "total_duration")[0]?.value).toBe(85);
  });

  it("lists logged weights with their session counts", () => {
    expect(loggedWeights(history)).toEqual([
      { weightKg: 105, sessions: 1 },
      { weightKg: 100, sessions: 1 },
      { weightKg: 90, sessions: 1 },
      { weightKg: 80, sessions: 1 },
    ]);
  });
});

describe("exerciseRecords", () => {
  it("finds the headline records, keeping the first to reach a value", () => {
    const records = exerciseRecords("weight_reps", [
      perf(1, [s(100, 5)]),
      perf(2, [s(100, 5), s(80, 15)]),
      perf(3, [s(110, 1)]),
    ]);
    const byKind = Object.fromEntries(
      records.headline.map((r) => [r.kind, [r.value, r.at.sessionId]]),
    );
    expect(byKind).toEqual({
      e1rm: [100 * (1 + 5 / 30), "s1"],
      weight: [110, "s3"],
      session_volume: [1700, "s2"],
    });
  });

  it("covers sets above the e1RM cap in the rep and weight tables", () => {
    const { byReps, byWeight } = exerciseRecords("weight_reps", [
      perf(1, [s(100, 5), s(80, 15)]),
      perf(2, [s(102.5, 5), s(80, 16), s(100, 3)]),
    ]);
    expect(
      byReps.map((r) => [r.reps, r.weightKg, r.e1rmKg !== null, r.beaten]),
    ).toEqual([
      [3, 100, true, true],
      [5, 102.5, true, false],
      [15, 80, false, true],
      [16, 80, false, false],
    ]);
    expect(byWeight.map((r) => [r.weightKg, r.reps, r.beaten])).toEqual([
      [102.5, 5, false],
      [100, 5, true],
      [80, 16, false],
    ]);
  });

  it("separates bodyweight sets with and without added weight", () => {
    const records = exerciseRecords("bodyweight_reps", [
      perf(1, [s(0, 15), s(20, 5)]),
    ]);
    expect(records.headline.map((r) => [r.kind, r.value])).toEqual([
      ["e1rm", 20 * (1 + 5 / 30)],
      ["weight", 20],
      ["reps", 15],
    ]);
    expect(records.byReps.map((r) => r.reps)).toEqual([5]);
  });

  it("has no tables for other exercise types", () => {
    const records = exerciseRecords("time", [perf(1, [secs(40), secs(50)])]);
    expect(records.headline.map((r) => [r.kind, r.value])).toEqual([
      ["duration", 50],
      ["session_duration", 90],
    ]);
    expect(records.byReps).toEqual([]);
  });
});

describe("frequency", () => {
  const range = { from: "2026-01-05", to: "2026-01-25" };

  it("counts sessions per week, empty weeks included", () => {
    const result = sessionsPerWeek(
      ["2026-01-01", "2026-01-05", "2026-01-07", "2026-01-07", "2026-01-21"],
      range,
      "monday",
    );
    expect(result.weeks).toEqual([
      { week: "2026-01-05", sessions: 3 },
      { week: "2026-01-12", sessions: 0 },
      { week: "2026-01-19", sessions: 1 },
    ]);
    expect(result.average).toBeCloseTo(4 / 3);
  });

  it("measures gaps between training days, not sessions", () => {
    const result = daysBetweenSessions(
      ["2026-01-05", "2026-01-05", "2026-01-07", "2026-01-10", "2026-01-12"],
      range,
    );
    expect(result.average).toBeCloseTo(7 / 3);
    expect(result.distribution).toEqual([
      { days: 1, orMore: false, count: 0 },
      { days: 2, orMore: false, count: 2 },
      { days: 3, orMore: false, count: 1 },
    ]);
    expect(daysBetweenSessions(["2026-01-05"], range).average).toBeNull();
  });

  it("puts long gaps in the last bucket", () => {
    const { distribution } = daysBetweenSessions(["2025-01-01", "2025-02-01"], {
      from: "2025-01-01",
      to: "2025-12-31",
    });
    expect(distribution).toHaveLength(GAP_BUCKET_LIMIT);
    expect(distribution.at(-1)).toEqual({
      days: GAP_BUCKET_LIMIT,
      orMore: true,
      count: 1,
    });
  });

  it("counts each date once per muscle group", () => {
    const result = muscleGroupFrequency(
      [
        { date: "2025-12-20", groups: ["Legs"] },
        { date: "2026-01-05", groups: ["Chest", "Arms"] },
        { date: "2026-01-05", groups: ["Chest"] },
        { date: "2026-01-14", groups: ["Chest"] },
      ],
      ["Chest", "Legs", "Core"],
      range,
      "monday",
    );
    expect(result).toEqual([
      { group: "Chest", daysPerWeek: 2 / 3, lastDate: "2026-01-14" },
      { group: "Legs", daysPerWeek: 0, lastDate: "2025-12-20" },
      { group: "Core", daysPerWeek: 0, lastDate: null },
    ]);
  });
});
