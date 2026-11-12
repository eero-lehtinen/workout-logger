import type { ExerciseItem, MuscleItem } from "@workout-logger/core";
import {
  MUSCLE_GROUPS,
  MUSCLES,
  type MuscleGroup,
  type MuscleKey,
  muscleId,
} from "@workout-logger/exercises";
import { useDbQuery } from "../../db/react.tsx";
import { i18n } from "../../i18n/index.ts";

export function useMuscleMap(): Map<string, MuscleItem> {
  const muscles = useDbQuery("muscles");
  return new Map(muscles.map((m) => [m.id, m]));
}

const KEY_BY_ID = new Map(
  (Object.keys(MUSCLES) as MuscleKey[]).map((key) => [muscleId(key), key]),
);

/**
 * A muscle's name in the UI language. The rows keep the catalog's English
 * names, so the name is looked up by the muscle's key.
 */
export function muscleName(muscle: Pick<MuscleItem, "id" | "name">): string {
  const key = KEY_BY_ID.get(muscle.id);
  return key ? i18n.t(`muscles.names.${key}`) : muscle.name;
}

/** A muscle group's name in the UI language; `group` is the stored name. */
export function muscleGroupName(group: string): string {
  return (MUSCLE_GROUPS as readonly string[]).includes(group)
    ? i18n.t(`muscles.groups.${group as MuscleGroup}`)
    : group;
}

/** Names of the primary muscles, e.g. "Chest, Triceps". */
export function primaryMuscles(
  exercise: Pick<ExerciseItem, "muscles">,
  muscles: Map<string, MuscleItem>,
): string {
  return Object.entries(exercise.muscles)
    .filter(([, factor]) => factor === 1)
    .map(([id]) => muscles.get(id))
    .filter((muscle) => muscle !== undefined)
    .map(muscleName)
    .join(", ");
}

/** Whether the two exercises have a primary muscle in common. */
export function sharesPrimaryMuscle(
  a: Pick<ExerciseItem, "muscles">,
  b: Pick<ExerciseItem, "muscles">,
): boolean {
  return Object.entries(a.muscles).some(
    ([id, factor]) => factor === 1 && b.muscles[id] === 1,
  );
}

/** Whether a primary muscle of the exercise is in the group. */
export function inMuscleGroup(
  exercise: Pick<ExerciseItem, "muscles">,
  group: string,
  muscles: Map<string, MuscleItem>,
): boolean {
  return Object.entries(exercise.muscles).some(
    ([id, factor]) => factor === 1 && muscles.get(id)?.group === group,
  );
}
