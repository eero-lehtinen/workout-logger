import { describe, expect, it } from "vitest";
import type { SetValues } from "./markers.ts";
import { nextDay } from "./next-day.ts";
import { compareOrder, positionBetween } from "./position.ts";
import { prefillNextSet } from "./prefill.ts";
import {
  DEFAULT_IDLE_THRESHOLD_MS,
  effectiveSessionEnd,
} from "./session-end.ts";
import {
  displayDerived,
  displayWeight,
  formatWeight,
  fromKg,
  stepWeight,
  toKg,
  weightIncrement,
} from "./units.ts";

const s = (weight_kg: number | null, reps: number | null): SetValues => ({
  weight_kg,
  reps,
  duration_s: null,
  distance_m: null,
});

describe("prefillNextSet", () => {
  const previous = [s(100, 8), s(100, 7), s(100, 6)];

  it("copies set 1 of the previous performance for set 1", () => {
    expect(prefillNextSet([], previous)).toEqual(s(100, 8));
  });

  it("takes this session's weight and the previous performance's reps", () => {
    expect(prefillNextSet([s(102.5, 8)], previous)).toEqual(s(102.5, 7));
    expect(prefillNextSet([s(102.5, 8), s(102.5, 6)], previous)).toEqual(
      s(102.5, 6),
    );
  });

  it("falls back to this session's previous set", () => {
    expect(
      prefillNextSet([s(100, 8), s(100, 7), s(100, 6), s(95, 9)], previous),
    ).toEqual(s(95, 9));
    expect(prefillNextSet([s(60, 12)], null)).toEqual(s(60, 12));
  });

  it("is empty without any history", () => {
    expect(prefillNextSet([], null)).toEqual(s(null, null));
    expect(prefillNextSet([], [])).toEqual(s(null, null));
  });

  it("treats duration and distance like reps", () => {
    const run = (distance_m: number, duration_s: number): SetValues => ({
      weight_kg: null,
      reps: null,
      distance_m,
      duration_s,
    });
    expect(
      prefillNextSet([run(1000, 300)], [run(1000, 280), run(2000, 600)]),
    ).toEqual(run(2000, 600));
  });
});

describe("nextDay", () => {
  const day = (id: string, position: string, deleted = false) => ({
    id,
    position,
    deleted,
  });
  const days = [day("c", "a2"), day("a", "a0"), day("b", "a1")];

  it("starts at the first day without history", () => {
    expect(nextDay(days, null)).toBe("a");
    expect(nextDay([], null)).toBeNull();
  });

  it("follows the last performed day by position and wraps", () => {
    expect(nextDay(days, "a")).toBe("b");
    expect(nextDay(days, "c")).toBe("a");
    expect(nextDay([day("a", "a0")], "a")).toBe("a");
  });

  it("uses a deleted last day's position to find the next existing day", () => {
    expect(nextDay([...days, day("x", "a1V", true)], "x")).toBe("c");
    expect(nextDay([day("a", "a0"), day("b", "a1", true)], "b")).toBe("a");
  });

  it("starts over when the last day is unknown or every day is deleted", () => {
    expect(nextDay(days, "missing")).toBe("a");
    expect(nextDay([day("a", "a0", true)], "a")).toBeNull();
  });

  it("breaks position ties by id, as queries do", () => {
    expect(nextDay([day("b", "a0"), day("a", "a0"), day("c", "a0")], "a")).toBe(
      "b",
    );
  });
});

describe("compareOrder and positions", () => {
  it("sorts by position, then id, by code unit", () => {
    const rows = [
      { position: "a1", id: "x" },
      { position: "Zz", id: "y" },
      { position: "a1", id: "a" },
    ];
    expect(rows.sort(compareOrder).map((r) => r.id)).toEqual(["y", "a", "x"]);
  });

  it("generates keys that sort between their neighbours", () => {
    const first = positionBetween(null, null);
    const later = positionBetween(first, null);
    const middle = positionBetween(first, later);
    expect([later, middle, first].sort()).toEqual([first, middle, later]);
  });
});

describe("effectiveSessionEnd", () => {
  const start = 1_700_000_000_000;
  const open = { started_at: start, ended_at: null, end_reason: null };

  it("uses a stored end", () => {
    expect(
      effectiveSessionEnd(
        { ...open, ended_at: start + 5, end_reason: "manual" },
        null,
        start + 10,
      ),
    ).toEqual({
      running: false,
      endedAt: start + 5,
      reason: "manual",
    });
    expect(
      effectiveSessionEnd(
        { ...open, ended_at: start, end_reason: "unknown" },
        null,
        start,
      ),
    ).toMatchObject({
      reason: "unknown",
    });
  });

  it("ends at the last set once the idle threshold is exceeded", () => {
    const lastSet = start + 60_000;
    expect(
      effectiveSessionEnd(open, lastSet, lastSet + DEFAULT_IDLE_THRESHOLD_MS),
    ).toEqual({ running: true });
    expect(
      effectiveSessionEnd(
        open,
        lastSet,
        lastSet + DEFAULT_IDLE_THRESHOLD_MS + 1,
      ),
    ).toEqual({
      running: false,
      endedAt: lastSet,
      reason: "idle",
    });
  });

  it("measures from the start when no set was logged", () => {
    expect(effectiveSessionEnd(open, null, start + 1000, 999)).toEqual({
      running: false,
      endedAt: start,
      reason: "idle",
    });
    expect(effectiveSessionEnd(open, null, start + 1000, 1000)).toEqual({
      running: true,
    });
  });

  it("keeps running when the next set resets the idle clock", () => {
    expect(
      effectiveSessionEnd(open, start + 3_600_000, start + 3_600_000 + 1000),
    ).toEqual({ running: true });
  });
});

describe("units", () => {
  it("converts lb exactly and back to the entered value", () => {
    expect(toKg(225, "lb")).toBe(102.05828325);
    expect(displayWeight(toKg(225, "lb"), "lb")).toBe(225);
    expect(fromKg(100, "kg")).toBe(100);
  });

  it("rounds to 2 decimals for display and 1 for derived values", () => {
    expect(displayWeight(100, "lb")).toBe(220.46);
    expect(displayWeight(102.5, "kg")).toBe(102.5);
    expect(displayDerived(133.33333, "kg")).toBe(133.3);
  });

  it("formats with trimmed trailing zeros and the locale's separator", () => {
    expect(formatWeight(100, "kg", "en-US")).toBe("100");
    expect(formatWeight(102.5, "kg", "en-US")).toBe("102.5");
    expect(formatWeight(100, "lb", "en-US")).toBe("220.46");
    expect(formatWeight(102.5, "kg", "fi-FI")).toBe("102,5");
    expect(formatWeight(1000, "kg", "en-US")).toBe("1000");
  });

  it("picks the increment from the exercise, else the unit default", () => {
    expect(weightIncrement("kg", null)).toBe(2.5);
    expect(weightIncrement("lb", null)).toBe(5);
    expect(weightIncrement("kg", 1)).toBe(1);
    expect(weightIncrement("lb", toKg(2.5, "lb"))).toBeCloseTo(2.5, 12);
    expect(weightIncrement("kg", null, 1.25)).toBe(1.25);
  });

  it("snaps to the increment, then steps", () => {
    expect(stepWeight(220.46, 5, 1)).toBe(225);
    expect(stepWeight(220.46, 5, -1)).toBe(215);
    expect(stepWeight(100, 2.5, 1)).toBe(102.5);
    expect(stepWeight(0.2, 0.1, 1)).toBe(0.3);
    expect(stepWeight(1, 2.5, -1)).toBe(0);
  });
});
