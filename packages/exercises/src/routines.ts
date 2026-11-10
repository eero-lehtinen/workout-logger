import type { RoutineContent } from "@workout-logger/core";
import { EXERCISES } from "./catalog.ts";
import { exerciseId } from "./seed.ts";

/**
 * A routine shipped with the app. Not seeded: adding one copies it into the
 * user's routines, which they then own and edit like any other.
 */
export interface CatalogRoutine {
  key: string;
  name: string;
  description: string;
  /** Each slot: the exercise key, then its alternatives' keys. */
  days: { name: string; slots: [string, ...string[]][] }[];
}

export const ROUTINES: readonly CatalogRoutine[] = [
  {
    key: "upper_upper_legs",
    name: "Eero's Upper/Upper/Legs",
    description:
      "Two upper body days, one starting with chest and back and one with arms, then legs. About five exercises a day.",
    days: [
      {
        name: "Upper, chest and back first",
        slots: [
          [
            "barbell_bench_press",
            "dumbbell_bench_press",
            "machine_chest_press",
            "smith_machine_bench_press",
          ],
          ["machine_row", "seated_cable_row", "t_bar_row", "dumbbell_row"],
          [
            "overhead_cable_triceps_extension",
            "dumbbell_overhead_triceps_extension",
            "rope_pushdown",
            "skull_crusher",
          ],
          ["hammer_curl", "dumbbell_curl", "cable_curl"],
          [
            "machine_lateral_raise",
            "dumbbell_lateral_raise",
            "cable_lateral_raise",
          ],
          ["machine_crunch", "cable_crunch", "hanging_leg_raise"],
        ],
      },
      {
        name: "Upper, arms first",
        slots: [
          [
            "preacher_curl",
            "machine_preacher_curl",
            "ez_bar_curl",
            "dumbbell_curl",
          ],
          [
            "rope_pushdown",
            "triceps_pushdown",
            "overhead_cable_triceps_extension",
          ],
          [
            "machine_shoulder_press",
            "dumbbell_shoulder_press",
            "machine_lateral_raise",
            "dumbbell_lateral_raise",
          ],
          ["lat_pulldown", "close_grip_lat_pulldown", "pull_up", "chin_up"],
          [
            "smith_machine_bench_press",
            "incline_dumbbell_press",
            "machine_chest_press",
            "dumbbell_bench_press",
          ],
          ["machine_crunch", "cable_crunch", "hanging_leg_raise"],
        ],
      },
      {
        name: "Legs",
        slots: [
          [
            "leg_press",
            "hack_squat",
            "smith_machine_squat",
            "back_squat",
            "goblet_squat",
          ],
          [
            "romanian_deadlift",
            "dumbbell_stiff_leg_deadlift",
            "back_extension",
          ],
          ["standing_calf_raise", "seated_calf_raise", "leg_press_calf_raise"],
          ["leg_extension", "bulgarian_split_squat"],
          ["lying_leg_curl", "seated_leg_curl"],
        ],
      },
    ],
  },
];

/** The arguments of `createRoutineWithDays` for a built-in routine. */
export function routineContent(routine: CatalogRoutine): RoutineContent {
  const known = new Set(EXERCISES.map((e) => e.key));
  const id = (key: string) => {
    if (!known.has(key)) throw new Error(`no built-in exercise ${key}`);
    return exerciseId(key);
  };
  return {
    name: routine.name,
    description: routine.description,
    days: routine.days.map((day) => ({
      name: day.name,
      slots: day.slots.map(([exercise, ...alternatives]) => ({
        exerciseId: id(exercise),
        alternativeIds: alternatives.map(id),
      })),
    })),
  };
}
