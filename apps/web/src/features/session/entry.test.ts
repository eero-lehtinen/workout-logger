import { describe, expect, it } from "vitest";
import { entryFromSet, setFromEntry } from "./entry.ts";

const set = (weight_kg: number | null, reps: number | null) => ({
  weight_kg,
  reps,
  duration_s: null,
  distance_m: null,
});

describe("set entry", () => {
  it("round-trips a weight through the display unit unchanged", () => {
    const stored = set(102.05828325, 5);
    const entry = entryFromSet(stored, "lb");
    expect(setFromEntry(entry, "weight_reps", "lb")?.weight_kg).toBeCloseTo(
      stored.weight_kg ?? 0,
      9,
    );
  });

  it("needs weight and at least one rep for weight_reps", () => {
    expect(
      setFromEntry(entryFromSet(set(null, 5), "kg"), "weight_reps", "kg"),
    ).toBeNull();
    expect(
      setFromEntry(entryFromSet(set(100, 0), "kg"), "weight_reps", "kg"),
    ).toBeNull();
    expect(
      setFromEntry(entryFromSet(set(100, 5), "kg"), "weight_reps", "kg"),
    ).toEqual(set(100, 5));
  });

  it("stores no added weight as zero and drops fields the type doesn't use", () => {
    const entry = { weight: null, reps: 8, durationS: 30, distanceKm: 1 };
    expect(setFromEntry(entry, "bodyweight_reps", "kg")).toEqual(set(0, 8));
    expect(setFromEntry(entry, "reps", "kg")).toEqual(set(null, 8));
    expect(setFromEntry(entry, "distance_time", "kg")).toEqual({
      weight_kg: null,
      reps: null,
      duration_s: 30,
      distance_m: 1000,
    });
  });
});
