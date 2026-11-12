import type { ExerciseItem } from "@workout-logger/core";
import { usePreference } from "../../lib/preference.ts";

export type ExerciseSort = "name" | "recent" | "most";

export const EXERCISE_SORTS = [
  "name",
  "recent",
  "most",
] as const satisfies readonly ExerciseSort[];

const byName = (a: ExerciseItem, b: ExerciseItem) =>
  a.name.localeCompare(b.name);

/** A sorted copy. Ties, and exercises never logged, go by name. */
export function sortExercises(
  exercises: readonly ExerciseItem[],
  sort: ExerciseSort,
): ExerciseItem[] {
  const sorted = [...exercises];
  switch (sort) {
    case "name":
      return sorted.sort(byName);
    case "recent":
      return sorted.sort(
        (a, b) =>
          (b.lastLoggedAt ?? Number.NEGATIVE_INFINITY) -
            (a.lastLoggedAt ?? Number.NEGATIVE_INFINITY) || byName(a, b),
      );
    case "most":
      return sorted.sort((a, b) => b.loggedSets - a.loggedSets || byName(a, b));
  }
}

/** One order for the exercise list and the picker, remembered on the device. */
export function useExerciseSort() {
  return usePreference<ExerciseSort>("exercise-sort", EXERCISE_SORTS, "name");
}
