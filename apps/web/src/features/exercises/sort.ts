import type { ExerciseItem } from "@workout-logger/core";
import { usePreference } from "../../lib/preference.ts";

export type ExerciseSort = "name" | "recent" | "most";

/** Short labels: the dropdown sits beside the search with a sort icon. */
export const EXERCISE_SORTS = [
  { value: "name", label: "Name" },
  { value: "recent", label: "Recent" },
  { value: "most", label: "Most logged" },
] as const satisfies readonly { value: ExerciseSort; label: string }[];

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
      return sorted.sort(
        (a, b) => b.loggedSessions - a.loggedSessions || byName(a, b),
      );
  }
}

/** One order for the exercise list and the picker, remembered on the device. */
export function useExerciseSort() {
  return usePreference<ExerciseSort>(
    "exercise-sort",
    EXERCISE_SORTS.map((s) => s.value),
    "name",
  );
}
