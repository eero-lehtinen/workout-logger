import type { ExerciseType } from "@workout-logger/core";
import type { MuscleKey } from "./muscles.ts";

/**
 * The HLC wall of every seeded row. Never changes: it is older than any edit
 * a user can make, so an edit to a built-in beats every catalog revision on
 * every device, whichever syncs first.
 */
export const CATALOG_WALL = Date.UTC(2026, 10, 10);

/**
 * The HLC counter of every seeded row. Raise it by one whenever the catalog
 * changes; devices then write the new revision over the old one, but never
 * over a user's edit.
 */
export const CATALOG_REVISION = 1;

/** 1 = primary muscle, 0.5 = secondary. */
export type Factor = 1 | 0.5;

export interface CatalogExercise {
  /** Permanent: the exercise id derives from it, and import mapping files refer to it. */
  key: string;
  name: string;
  type: ExerciseType;
  muscles: Partial<Record<MuscleKey, Factor>>;
  /** The free-exercise-db id it was curated from (public domain, the Unlicense). */
  source?: string;
  /**
   * Set instead of removing an entry: history refers to built-ins, so they
   * are archived, never deleted.
   */
  archived?: boolean;
}

function ex(
  key: string,
  name: string,
  type: ExerciseType,
  muscles: CatalogExercise["muscles"],
  source?: string,
): CatalogExercise {
  return source === undefined
    ? { key, name, type, muscles }
    : { key, name, type, muscles, source };
}

const press = { front_delts: 0.5, triceps: 0.5 } as const;
const row = { upper_back: 1, lats: 1, biceps: 0.5, rear_delts: 0.5 } as const;
const pulldown = { lats: 1, upper_back: 0.5, biceps: 0.5 } as const;
const overhead = { front_delts: 1, side_delts: 0.5, triceps: 0.5 } as const;

/**
 * Curated common gym exercises. Muscle targets are set by hand: the source
 * data's targets are coarse ("shoulders") and sometimes wrong.
 */
export const EXERCISES: readonly CatalogExercise[] = [
  // Chest
  ex(
    "barbell_bench_press",
    "Barbell Bench Press",
    "weight_reps",
    { chest: 1, ...press },
    "Barbell_Bench_Press_-_Medium_Grip",
  ),
  ex(
    "incline_barbell_bench_press",
    "Incline Barbell Bench Press",
    "weight_reps",
    { chest: 1, ...press },
    "Barbell_Incline_Bench_Press_-_Medium_Grip",
  ),
  ex(
    "decline_barbell_bench_press",
    "Decline Barbell Bench Press",
    "weight_reps",
    { chest: 1, ...press },
    "Decline_Barbell_Bench_Press",
  ),
  ex(
    "close_grip_bench_press",
    "Close-Grip Bench Press",
    "weight_reps",
    { triceps: 1, chest: 1, front_delts: 0.5 },
    "Close-Grip_Barbell_Bench_Press",
  ),
  ex(
    "dumbbell_bench_press",
    "Dumbbell Bench Press",
    "weight_reps",
    { chest: 1, ...press },
    "Dumbbell_Bench_Press",
  ),
  ex(
    "incline_dumbbell_press",
    "Incline Dumbbell Bench Press",
    "weight_reps",
    { chest: 1, ...press },
    "Incline_Dumbbell_Press",
  ),
  ex(
    "machine_chest_press",
    "Machine Chest Press",
    "weight_reps",
    { chest: 1, ...press },
    "Leverage_Chest_Press",
  ),
  ex(
    "smith_machine_bench_press",
    "Smith Bench Press",
    "weight_reps",
    { chest: 1, ...press },
    "Smith_Machine_Bench_Press",
  ),
  ex(
    "dumbbell_fly",
    "Dumbbell Fly",
    "weight_reps",
    { chest: 1 },
    "Dumbbell_Flyes",
  ),
  ex(
    "incline_dumbbell_fly",
    "Incline Dumbbell Fly",
    "weight_reps",
    { chest: 1, front_delts: 0.5 },
    "Incline_Dumbbell_Flyes",
  ),
  ex(
    "cable_crossover",
    "Cable Fly",
    "weight_reps",
    { chest: 1 },
    "Cable_Crossover",
  ),
  ex("pec_deck", "Machine Fly", "weight_reps", { chest: 1 }, "Butterfly"),
  ex(
    "push_up",
    "Push-Up",
    "bodyweight_reps",
    { chest: 1, ...press },
    "Pushups",
  ),
  ex(
    "chest_dip",
    "Chest Dip",
    "bodyweight_reps",
    { chest: 1, ...press },
    "Dips_-_Chest_Version",
  ),

  // Back
  ex("pull_up", "Pull-Up", "bodyweight_reps", pulldown, "Pullups"),
  ex("chin_up", "Chin-Up", "bodyweight_reps", pulldown, "Chin-Up"),
  ex(
    "lat_pulldown",
    "Lat Pulldown",
    "weight_reps",
    pulldown,
    "Wide-Grip_Lat_Pulldown",
  ),
  ex(
    "close_grip_lat_pulldown",
    "Close-Grip Lat Pulldown",
    "weight_reps",
    pulldown,
    "Close-Grip_Front_Lat_Pulldown",
  ),
  ex(
    "straight_arm_pulldown",
    "Straight-Arm Pulldown",
    "weight_reps",
    { lats: 1 },
    "Straight-Arm_Pulldown",
  ),
  ex(
    "seated_cable_row",
    "Seated Cable Row",
    "weight_reps",
    row,
    "Seated_Cable_Rows",
  ),
  ex(
    "barbell_row",
    "Barbell Row",
    "weight_reps",
    { ...row, lower_back: 0.5 },
    "Bent_Over_Barbell_Row",
  ),
  ex(
    "dumbbell_row",
    "Dumbbell Row",
    "weight_reps",
    row,
    "One-Arm_Dumbbell_Row",
  ),
  ex(
    "t_bar_row",
    "T-Bar Row",
    "weight_reps",
    { ...row, lower_back: 0.5 },
    "T-Bar_Row_with_Handle",
  ),
  ex(
    "chest_supported_t_bar_row",
    "Chest-Supported T-Bar Row",
    "weight_reps",
    row,
    "Lying_T-Bar_Row",
  ),
  ex("machine_row", "Machine Row", "weight_reps", row, "Leverage_Iso_Row"),
  ex(
    "inverted_row",
    "Inverted Row",
    "bodyweight_reps",
    { upper_back: 1, lats: 0.5, biceps: 0.5, rear_delts: 0.5 },
    "Inverted_Row",
  ),
  ex(
    "face_pull",
    "Face Pull",
    "weight_reps",
    { rear_delts: 1, upper_back: 0.5 },
    "Face_Pull",
  ),
  ex(
    "deadlift",
    "Deadlift",
    "weight_reps",
    {
      glutes: 1,
      hamstrings: 1,
      lower_back: 1,
      quads: 0.5,
      upper_back: 0.5,
      traps: 0.5,
      forearms: 0.5,
    },
    "Barbell_Deadlift",
  ),
  ex(
    "sumo_deadlift",
    "Sumo Deadlift",
    "weight_reps",
    {
      glutes: 1,
      hamstrings: 1,
      quads: 0.5,
      adductors: 0.5,
      lower_back: 0.5,
      traps: 0.5,
    },
    "Sumo_Deadlift",
  ),
  ex(
    "trap_bar_deadlift",
    "Trap Bar Deadlift",
    "weight_reps",
    { quads: 1, glutes: 1, hamstrings: 0.5, lower_back: 0.5, traps: 0.5 },
    "Trap_Bar_Deadlift",
  ),
  ex(
    "romanian_deadlift",
    "Romanian Deadlift",
    "weight_reps",
    { hamstrings: 1, glutes: 1, lower_back: 0.5 },
    "Romanian_Deadlift",
  ),
  ex(
    "stiff_leg_deadlift",
    "Barbell Stiff-Leg Deadlift",
    "weight_reps",
    { hamstrings: 1, glutes: 0.5, lower_back: 0.5 },
    "Stiff-Legged_Barbell_Deadlift",
  ),
  ex(
    "dumbbell_stiff_leg_deadlift",
    "Dumbbell Stiff-Leg Deadlift",
    "weight_reps",
    { hamstrings: 1, glutes: 0.5, lower_back: 0.5 },
    "Stiff-Legged_Dumbbell_Deadlift",
  ),
  ex(
    "rack_pull",
    "Rack Pull",
    "weight_reps",
    {
      lower_back: 1,
      glutes: 0.5,
      hamstrings: 0.5,
      upper_back: 0.5,
      traps: 0.5,
    },
    "Rack_Pulls",
  ),
  ex(
    "good_morning",
    "Good Morning",
    "weight_reps",
    { hamstrings: 1, lower_back: 1, glutes: 0.5 },
    "Good_Morning",
  ),
  ex(
    "back_extension",
    "Back Extension",
    "bodyweight_reps",
    { lower_back: 1, glutes: 0.5, hamstrings: 0.5 },
    "Hyperextensions_Back_Extensions",
  ),
  ex(
    "barbell_shrug",
    "Barbell Shrug",
    "weight_reps",
    { traps: 1 },
    "Barbell_Shrug",
  ),
  ex(
    "dumbbell_shrug",
    "Dumbbell Shrug",
    "weight_reps",
    { traps: 1 },
    "Dumbbell_Shrug",
  ),

  // Shoulders
  ex(
    "overhead_press",
    "Overhead Press",
    "weight_reps",
    overhead,
    "Standing_Military_Press",
  ),
  ex(
    "seated_barbell_overhead_press",
    "Seated Overhead Press",
    "weight_reps",
    overhead,
    "Seated_Barbell_Military_Press",
  ),
  ex(
    "dumbbell_shoulder_press",
    "Dumbbell Shoulder Press",
    "weight_reps",
    overhead,
    "Dumbbell_Shoulder_Press",
  ),
  ex(
    "arnold_press",
    "Arnold Press",
    "weight_reps",
    overhead,
    "Arnold_Dumbbell_Press",
  ),
  ex(
    "machine_shoulder_press",
    "Machine Shoulder Press",
    "weight_reps",
    overhead,
    "Leverage_Shoulder_Press",
  ),
  ex(
    "smith_machine_shoulder_press",
    "Smith Shoulder Press",
    "weight_reps",
    overhead,
    "Smith_Machine_Overhead_Shoulder_Press",
  ),
  ex(
    "dumbbell_lateral_raise",
    "Dumbbell Lateral Raise",
    "weight_reps",
    { side_delts: 1 },
    "Side_Lateral_Raise",
  ),
  ex("cable_lateral_raise", "Cable Lateral Raise", "weight_reps", {
    side_delts: 1,
  }),
  ex("machine_lateral_raise", "Machine Lateral Raise", "weight_reps", {
    side_delts: 1,
  }),
  ex(
    "dumbbell_front_raise",
    "Front Raise",
    "weight_reps",
    { front_delts: 1 },
    "Front_Dumbbell_Raise",
  ),
  ex(
    "dumbbell_rear_delt_fly",
    "Dumbbell Rear Delt Fly",
    "weight_reps",
    { rear_delts: 1, upper_back: 0.5 },
    "Reverse_Flyes",
  ),
  ex(
    "reverse_pec_deck",
    "Machine Rear Delt Fly",
    "weight_reps",
    { rear_delts: 1, upper_back: 0.5 },
    "Reverse_Machine_Flyes",
  ),
  ex(
    "cable_rear_delt_fly",
    "Cable Rear Delt Fly",
    "weight_reps",
    { rear_delts: 1 },
    "Cable_Rear_Delt_Fly",
  ),
  ex(
    "upright_row",
    "Upright Row",
    "weight_reps",
    { side_delts: 1, traps: 0.5, biceps: 0.5 },
    "Upright_Barbell_Row",
  ),

  // Arms
  ex(
    "barbell_curl",
    "Barbell Curl",
    "weight_reps",
    { biceps: 1, forearms: 0.5 },
    "Barbell_Curl",
  ),
  ex(
    "ez_bar_curl",
    "EZ Bar Curl",
    "weight_reps",
    { biceps: 1, forearms: 0.5 },
    "EZ-Bar_Curl",
  ),
  ex(
    "dumbbell_curl",
    "Dumbbell Curl",
    "weight_reps",
    { biceps: 1, forearms: 0.5 },
    "Dumbbell_Bicep_Curl",
  ),
  ex(
    "hammer_curl",
    "Hammer Curl",
    "weight_reps",
    { biceps: 1, forearms: 0.5 },
    "Hammer_Curls",
  ),
  ex(
    "incline_dumbbell_curl",
    "Incline Dumbbell Curl",
    "weight_reps",
    { biceps: 1 },
    "Incline_Dumbbell_Curl",
  ),
  ex(
    "preacher_curl",
    "EZ Bar Preacher Curl",
    "weight_reps",
    { biceps: 1 },
    "Preacher_Curl",
  ),
  ex(
    "machine_preacher_curl",
    "Machine Preacher Curl",
    "weight_reps",
    { biceps: 1 },
    "Machine_Preacher_Curls",
  ),
  ex(
    "cable_curl",
    "Cable Curl",
    "weight_reps",
    { biceps: 1 },
    "Standing_Biceps_Cable_Curl",
  ),
  ex(
    "concentration_curl",
    "Concentration Curl",
    "weight_reps",
    { biceps: 1 },
    "Concentration_Curls",
  ),
  ex(
    "reverse_curl",
    "Reverse Curl",
    "weight_reps",
    { forearms: 1, biceps: 0.5 },
    "Reverse_Barbell_Curl",
  ),
  ex(
    "wrist_curl",
    "Wrist Curl",
    "weight_reps",
    { forearms: 1 },
    "Palms-Up_Barbell_Wrist_Curl_Over_A_Bench",
  ),
  ex(
    "triceps_pushdown",
    "Triceps Pushdown",
    "weight_reps",
    { triceps: 1 },
    "Triceps_Pushdown",
  ),
  ex(
    "rope_pushdown",
    "Rope Pushdown",
    "weight_reps",
    { triceps: 1 },
    "Triceps_Pushdown_-_Rope_Attachment",
  ),
  ex(
    "overhead_cable_triceps_extension",
    "Cable Overhead Triceps Extension",
    "weight_reps",
    { triceps: 1 },
    "Cable_Rope_Overhead_Triceps_Extension",
  ),
  ex(
    "dumbbell_overhead_triceps_extension",
    "Dumbbell Overhead Triceps Extension",
    "weight_reps",
    { triceps: 1 },
    "Standing_Dumbbell_Triceps_Extension",
  ),
  ex(
    "skull_crusher",
    "Skull Crusher",
    "weight_reps",
    { triceps: 1 },
    "EZ-Bar_Skullcrusher",
  ),
  ex(
    "triceps_dip",
    "Triceps Dip",
    "bodyweight_reps",
    { triceps: 1, chest: 0.5, front_delts: 0.5 },
    "Dips_-_Triceps_Version",
  ),
  ex(
    "bench_dip",
    "Bench Dip",
    "bodyweight_reps",
    { triceps: 1, front_delts: 0.5 },
    "Bench_Dips",
  ),

  // Legs
  ex(
    "back_squat",
    "Back Squat",
    "weight_reps",
    { quads: 1, glutes: 1, adductors: 0.5, lower_back: 0.5 },
    "Barbell_Squat",
  ),
  ex(
    "front_squat",
    "Front Squat",
    "weight_reps",
    { quads: 1, glutes: 0.5, upper_back: 0.5 },
    "Front_Barbell_Squat",
  ),
  ex(
    "goblet_squat",
    "Goblet Squat",
    "weight_reps",
    { quads: 1, glutes: 0.5 },
    "Goblet_Squat",
  ),
  ex(
    "hack_squat",
    "Hack Squat",
    "weight_reps",
    { quads: 1, glutes: 0.5 },
    "Hack_Squat",
  ),
  ex(
    "smith_machine_squat",
    "Smith Squat",
    "weight_reps",
    { quads: 1, glutes: 0.5 },
    "Smith_Machine_Squat",
  ),
  ex(
    "leg_press",
    "Leg Press",
    "weight_reps",
    { quads: 1, glutes: 0.5 },
    "Leg_Press",
  ),
  ex(
    "bulgarian_split_squat",
    "Bulgarian Split Squat",
    "weight_reps",
    { quads: 1, glutes: 1, adductors: 0.5 },
    "Split_Squat_with_Dumbbells",
  ),
  ex(
    "dumbbell_lunge",
    "Dumbbell Lunge",
    "weight_reps",
    { quads: 1, glutes: 1, adductors: 0.5 },
    "Dumbbell_Lunges",
  ),
  ex(
    "barbell_lunge",
    "Barbell Lunge",
    "weight_reps",
    { quads: 1, glutes: 1, adductors: 0.5 },
    "Barbell_Lunge",
  ),
  ex(
    "dumbbell_step_up",
    "Step-Up",
    "weight_reps",
    { quads: 1, glutes: 1 },
    "Dumbbell_Step_Ups",
  ),
  ex(
    "leg_extension",
    "Leg Extension",
    "weight_reps",
    { quads: 1 },
    "Leg_Extensions",
  ),
  ex(
    "lying_leg_curl",
    "Lying Leg Curl",
    "weight_reps",
    { hamstrings: 1 },
    "Lying_Leg_Curls",
  ),
  ex(
    "seated_leg_curl",
    "Seated Leg Curl",
    "weight_reps",
    { hamstrings: 1 },
    "Seated_Leg_Curl",
  ),
  ex(
    "hip_thrust",
    "Barbell Hip Thrust",
    "weight_reps",
    { glutes: 1, hamstrings: 0.5 },
    "Barbell_Hip_Thrust",
  ),
  ex(
    "glute_bridge",
    "Barbell Glute Bridge",
    "weight_reps",
    { glutes: 1, hamstrings: 0.5 },
    "Barbell_Glute_Bridge",
  ),
  ex(
    "cable_pull_through",
    "Cable Pull-Through",
    "weight_reps",
    { glutes: 1, hamstrings: 0.5 },
    "Pull_Through",
  ),
  ex(
    "kettlebell_swing",
    "Kettlebell Swing",
    "weight_reps",
    { glutes: 1, hamstrings: 1, lower_back: 0.5 },
    "One-Arm_Kettlebell_Swings",
  ),
  ex(
    "standing_calf_raise",
    "Standing Calf Raise",
    "weight_reps",
    { calves: 1 },
    "Standing_Calf_Raises",
  ),
  ex(
    "seated_calf_raise",
    "Seated Calf Raise",
    "weight_reps",
    { calves: 1 },
    "Seated_Calf_Raise",
  ),
  ex(
    "leg_press_calf_raise",
    "Leg Press Calf Raise",
    "weight_reps",
    { calves: 1 },
    "Calf_Press_On_The_Leg_Press_Machine",
  ),
  ex(
    "hip_adduction",
    "Hip Adduction",
    "weight_reps",
    { adductors: 1 },
    "Thigh_Adductor",
  ),
  ex(
    "hip_abduction",
    "Hip Abduction",
    "weight_reps",
    { abductors: 1, glutes: 0.5 },
    "Thigh_Abductor",
  ),

  // Core
  ex("plank", "Plank", "time", { abs: 1, obliques: 0.5 }, "Plank"),
  ex(
    "side_plank",
    "Side Plank",
    "time",
    { obliques: 1, abs: 0.5 },
    "Side_Bridge",
  ),
  ex("crunch", "Crunch", "reps", { abs: 1 }, "Crunches"),
  ex(
    "decline_crunch",
    "Decline Crunch",
    "bodyweight_reps",
    { abs: 1 },
    "Decline_Crunch",
  ),
  ex("reverse_crunch", "Reverse Crunch", "reps", { abs: 1 }, "Reverse_Crunch"),
  ex("sit_up", "Sit-Up", "reps", { abs: 1 }, "Sit-Up"),
  ex("cable_crunch", "Cable Crunch", "weight_reps", { abs: 1 }, "Cable_Crunch"),
  ex(
    "machine_crunch",
    "Machine Crunch",
    "weight_reps",
    { abs: 1 },
    "Ab_Crunch_Machine",
  ),
  ex(
    "hanging_leg_raise",
    "Hanging Leg Raise",
    "reps",
    { abs: 1, obliques: 0.5 },
    "Hanging_Leg_Raise",
  ),
  ex("ab_wheel_rollout", "Ab Wheel Rollout", "reps", { abs: 1 }, "Ab_Roller"),
  ex(
    "russian_twist",
    "Russian Twist",
    "bodyweight_reps",
    { obliques: 1, abs: 0.5 },
    "Russian_Twist",
  ),

  // Cardio
  ex("running", "Running", "distance_time", {
    quads: 1,
    hamstrings: 0.5,
    glutes: 0.5,
    calves: 0.5,
  }),
  ex(
    "treadmill_running",
    "Treadmill Running",
    "distance_time",
    { quads: 1, hamstrings: 0.5, glutes: 0.5, calves: 0.5 },
    "Running_Treadmill",
  ),
  ex(
    "walking",
    "Walking",
    "distance_time",
    { quads: 1, calves: 0.5 },
    "Walking_Treadmill",
  ),
  ex(
    "cycling",
    "Cycling",
    "distance_time",
    { quads: 1, glutes: 0.5, calves: 0.5 },
    "Bicycling",
  ),
  ex(
    "stationary_bike",
    "Stationary Bike",
    "distance_time",
    { quads: 1, glutes: 0.5, calves: 0.5 },
    "Bicycling_Stationary",
  ),
  ex(
    "rowing_machine",
    "Rowing Machine",
    "distance_time",
    { quads: 1, upper_back: 1, lats: 0.5, glutes: 0.5, biceps: 0.5 },
    "Rowing_Stationary",
  ),
  ex(
    "elliptical",
    "Elliptical",
    "distance_time",
    { quads: 1, glutes: 0.5 },
    "Elliptical_Trainer",
  ),
  ex(
    "stair_climber",
    "Stair Climber",
    "distance_time",
    { quads: 1, glutes: 1, calves: 0.5 },
    "Stairmaster",
  ),
];

/** Built-in metrics. Body weight is the one Health Connect imports into. */
export const METRICS = [
  { key: "body_weight", name: "Body weight", unit: "kg" },
] as const;
