import type { ExerciseItem, MuscleItem } from "@workout-logger/core";
import { useDbQuery } from "../../db/react.tsx";

export function useMuscleMap(): Map<string, MuscleItem> {
  const muscles = useDbQuery("muscles");
  return new Map(muscles.map((m) => [m.id, m]));
}

/** Names of the primary muscles, e.g. "Chest, Triceps". */
export function primaryMuscles(
  exercise: Pick<ExerciseItem, "muscles">,
  muscles: Map<string, MuscleItem>,
): string {
  return Object.entries(exercise.muscles)
    .filter(([, factor]) => factor === 1)
    .map(([id]) => muscles.get(id)?.name)
    .filter(Boolean)
    .join(", ");
}

/** Every word of the query appears in the name, in any order. */
export function matchesSearch(name: string, query: string): boolean {
  const haystack = name.toLocaleLowerCase();
  return query
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
