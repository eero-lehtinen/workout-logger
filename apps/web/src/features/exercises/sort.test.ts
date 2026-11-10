import type { ExerciseItem } from "@workout-logger/core";
import { describe, expect, it } from "vitest";
import { sortExercises } from "./sort.ts";

const exercise = (
  name: string,
  lastLoggedAt: number | null,
  loggedSessions: number,
): ExerciseItem => ({
  id: name,
  name,
  type: "weight_reps",
  archived: false,
  builtin: true,
  muscles: {},
  lastLoggedAt,
  loggedSessions,
});

const list = [
  exercise("Squat", 100, 3),
  exercise("Curl", null, 0),
  exercise("Bench", 300, 1),
  exercise("Row", 300, 3),
];
const names = (sorted: ExerciseItem[]) => sorted.map((e) => e.name);

describe("sortExercises", () => {
  it("sorts by name", () => {
    expect(names(sortExercises(list, "name"))).toEqual([
      "Bench",
      "Curl",
      "Row",
      "Squat",
    ]);
  });

  it("puts the most recently logged first, never logged last", () => {
    expect(names(sortExercises(list, "recent"))).toEqual([
      "Bench",
      "Row",
      "Squat",
      "Curl",
    ]);
  });

  it("puts the most logged first, ties by name", () => {
    expect(names(sortExercises(list, "most"))).toEqual([
      "Row",
      "Squat",
      "Bench",
      "Curl",
    ]);
  });
});
