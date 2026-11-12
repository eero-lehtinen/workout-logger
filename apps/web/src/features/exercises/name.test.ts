import { describe, expect, it } from "vitest";
import { exerciseSummary } from "./name.ts";

describe("exerciseSummary", () => {
  it("names the first exercises and counts the rest", () => {
    expect(exerciseSummary(["Back Squat", "Barbell Row", "Dip"])).toBe(
      "Back Squat, Barbell Row, +1",
    );
    expect(exerciseSummary(["Dip"])).toBe("Dip");
    expect(exerciseSummary([])).toBe("");
  });
});
