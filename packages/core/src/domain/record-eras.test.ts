import { describe, expect, it } from "vitest";
import {
  addReset,
  latestReset,
  recordEra,
  removeReset,
} from "./record-eras.ts";

describe("record eras", () => {
  const resets = ["2026-03-01", "2026-09-15"];

  it("puts a session on a reset date in the new era", () => {
    expect(recordEra("2026-02-28", resets)).toBe(0);
    expect(recordEra("2026-03-01", resets)).toBe(1);
    expect(recordEra("2026-09-14", resets)).toBe(1);
    expect(recordEra("2026-09-15", resets)).toBe(2);
    expect(recordEra("2026-09-15", [])).toBe(0);
  });

  it("finds the latest reset in any order", () => {
    expect(latestReset(["2026-09-15", "2026-03-01"])).toBe("2026-09-15");
    expect(latestReset([])).toBeNull();
  });

  it("keeps resets sorted and unique", () => {
    expect(addReset(resets, "2026-05-01")).toEqual([
      "2026-03-01",
      "2026-05-01",
      "2026-09-15",
    ]);
    expect(addReset(resets, "2026-03-01")).toEqual(resets);
    expect(removeReset(resets, "2026-03-01")).toEqual(["2026-09-15"]);
  });
});
