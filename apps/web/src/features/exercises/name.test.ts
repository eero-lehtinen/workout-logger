import { describe, expect, it } from "vitest";
import { exerciseSummary, splitEquipment } from "./name.ts";

describe("splitEquipment", () => {
  it("splits a trailing parenthesized part", () => {
    expect(splitEquipment("Bench Press (Barbell)")).toEqual({
      base: "Bench Press",
      equipment: "Barbell",
    });
  });

  it("keeps names without one", () => {
    expect(splitEquipment("Dip")).toEqual({ base: "Dip", equipment: null });
    expect(splitEquipment("(Barbell)")).toEqual({
      base: "(Barbell)",
      equipment: null,
    });
  });
});

describe("exerciseSummary", () => {
  it("names the first exercises and counts the rest", () => {
    expect(
      exerciseSummary([
        "Bench Press (Barbell)",
        "Bent-Over Row (Barbell)",
        "Dip",
      ]),
    ).toBe("Bench Press, Bent-Over Row, +1");
    expect(exerciseSummary(["Dip"])).toBe("Dip");
    expect(exerciseSummary([])).toBe("");
  });
});
