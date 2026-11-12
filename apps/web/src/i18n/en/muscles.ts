import type { MuscleGroup, MuscleKey } from "@workout-logger/exercises";

/**
 * Names of the fixed muscle list, by key, and of its groups. The rows in the
 * database keep the English names; the UI shows these (`features/exercises/muscles.ts`).
 */
export const muscles = {
  names: {
    chest: "Chest",
    lats: "Lats",
    upper_back: "Upper back",
    traps: "Traps",
    lower_back: "Lower back",
    front_delts: "Front delts",
    side_delts: "Side delts",
    rear_delts: "Rear delts",
    biceps: "Biceps",
    triceps: "Triceps",
    forearms: "Forearms",
    quads: "Quads",
    hamstrings: "Hamstrings",
    glutes: "Glutes",
    adductors: "Adductors",
    abductors: "Abductors",
    calves: "Calves",
    abs: "Abs",
    obliques: "Obliques",
  },
  groups: {
    Chest: "Chest",
    Back: "Back",
    Shoulders: "Shoulders",
    Arms: "Arms",
    Legs: "Legs",
    Core: "Core",
  },
} as const satisfies {
  names: Record<MuscleKey, string>;
  groups: Record<MuscleGroup, string>;
};
