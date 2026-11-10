/**
 * The fixed muscle list: detailed enough for analytics, not anatomy. Keys are
 * permanent; muscle ids derive from them.
 */
export const MUSCLES = {
  chest: { name: "Chest", group: "Chest" },
  lats: { name: "Lats", group: "Back" },
  upper_back: { name: "Upper back", group: "Back" },
  traps: { name: "Traps", group: "Back" },
  lower_back: { name: "Lower back", group: "Back" },
  front_delts: { name: "Front delts", group: "Shoulders" },
  side_delts: { name: "Side delts", group: "Shoulders" },
  rear_delts: { name: "Rear delts", group: "Shoulders" },
  biceps: { name: "Biceps", group: "Arms" },
  triceps: { name: "Triceps", group: "Arms" },
  forearms: { name: "Forearms", group: "Arms" },
  quads: { name: "Quads", group: "Legs" },
  hamstrings: { name: "Hamstrings", group: "Legs" },
  glutes: { name: "Glutes", group: "Legs" },
  adductors: { name: "Adductors", group: "Legs" },
  abductors: { name: "Abductors", group: "Legs" },
  calves: { name: "Calves", group: "Legs" },
  abs: { name: "Abs", group: "Core" },
  obliques: { name: "Obliques", group: "Core" },
} as const satisfies Record<string, { name: string; group: MuscleGroup }>;

export type MuscleKey = keyof typeof MUSCLES;

export const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Legs",
  "Core",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
