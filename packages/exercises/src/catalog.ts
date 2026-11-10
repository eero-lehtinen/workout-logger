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
export const CATALOG_REVISION = 0;

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
    "Bench Press (Barbell)",
    "weight_reps",
    { chest: 1, ...press },
    "Barbell_Bench_Press_-_Medium_Grip",
  ),
  ex(
    "incline_barbell_bench_press",
    "Incline Bench Press (Barbell)",
    "weight_reps",
    { chest: 1, ...press },
    "Barbell_Incline_Bench_Press_-_Medium_Grip",
  ),
  ex(
    "decline_barbell_bench_press",
    "Decline Bench Press (Barbell)",
    "weight_reps",
    { chest: 1, ...press },
    "Decline_Barbell_Bench_Press",
  ),
  ex(
    "close_grip_bench_press",
    "Close-Grip Bench Press (Barbell)",
    "weight_reps",
    { triceps: 1, chest: 1, front_delts: 0.5 },
    "Close-Grip_Barbell_Bench_Press",
  ),
  ex(
    "dumbbell_bench_press",
    "Bench Press (Dumbbell)",
    "weight_reps",
    { chest: 1, ...press },
    "Dumbbell_Bench_Press",
  ),
  ex(
    "incline_dumbbell_press",
    "Incline Bench Press (Dumbbell)",
    "weight_reps",
    { chest: 1, ...press },
    "Incline_Dumbbell_Press",
  ),
  ex(
    "machine_chest_press",
    "Chest Press (Machine)",
    "weight_reps",
    { chest: 1, ...press },
    "Leverage_Chest_Press",
  ),
  ex(
    "smith_machine_bench_press",
    "Bench Press (Smith)",
    "weight_reps",
    { chest: 1, ...press },
    "Smith_Machine_Bench_Press",
  ),
  ex(
    "dumbbell_fly",
    "Fly (Dumbbell)",
    "weight_reps",
    { chest: 1 },
    "Dumbbell_Flyes",
  ),
  ex(
    "incline_dumbbell_fly",
    "Incline Fly (Dumbbell)",
    "weight_reps",
    { chest: 1, front_delts: 0.5 },
    "Incline_Dumbbell_Flyes",
  ),
  ex(
    "cable_crossover",
    "Fly (Cable)",
    "weight_reps",
    { chest: 1 },
    "Cable_Crossover",
  ),
  ex("pec_deck", "Fly (Machine)", "weight_reps", { chest: 1 }, "Butterfly"),
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
    "Lat Pulldown (Cable)",
    "weight_reps",
    pulldown,
    "Wide-Grip_Lat_Pulldown",
  ),
  ex(
    "close_grip_lat_pulldown",
    "Close-Grip Lat Pulldown (Cable)",
    "weight_reps",
    pulldown,
    "Close-Grip_Front_Lat_Pulldown",
  ),
  ex(
    "straight_arm_pulldown",
    "Straight-Arm Pulldown (Cable)",
    "weight_reps",
    { lats: 1 },
    "Straight-Arm_Pulldown",
  ),
  ex(
    "seated_cable_row",
    "Seated Row (Cable)",
    "weight_reps",
    row,
    "Seated_Cable_Rows",
  ),
  ex(
    "barbell_row",
    "Bent-Over Row (Barbell)",
    "weight_reps",
    { ...row, lower_back: 0.5 },
    "Bent_Over_Barbell_Row",
  ),
  ex(
    "dumbbell_row",
    "Row (Dumbbell)",
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
  ex("machine_row", "Row (Machine)", "weight_reps", row, "Leverage_Iso_Row"),
  ex(
    "inverted_row",
    "Inverted Row",
    "bodyweight_reps",
    { upper_back: 1, lats: 0.5, biceps: 0.5, rear_delts: 0.5 },
    "Inverted_Row",
  ),
  ex(
    "face_pull",
    "Face Pull (Cable)",
    "weight_reps",
    { rear_delts: 1, upper_back: 0.5 },
    "Face_Pull",
  ),
  ex(
    "deadlift",
    "Deadlift (Barbell)",
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
    "Sumo Deadlift (Barbell)",
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
    "Romanian Deadlift (Barbell)",
    "weight_reps",
    { hamstrings: 1, glutes: 1, lower_back: 0.5 },
    "Romanian_Deadlift",
  ),
  ex(
    "stiff_leg_deadlift",
    "Stiff-Leg Deadlift (Barbell)",
    "weight_reps",
    { hamstrings: 1, glutes: 0.5, lower_back: 0.5 },
    "Stiff-Legged_Barbell_Deadlift",
  ),
  ex(
    "dumbbell_stiff_leg_deadlift",
    "Stiff-Leg Deadlift (Dumbbell)",
    "weight_reps",
    { hamstrings: 1, glutes: 0.5, lower_back: 0.5 },
    "Stiff-Legged_Dumbbell_Deadlift",
  ),
  ex(
    "rack_pull",
    "Rack Pull (Barbell)",
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
    "Good Morning (Barbell)",
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
    "Shrug (Barbell)",
    "weight_reps",
    { traps: 1 },
    "Barbell_Shrug",
  ),
  ex(
    "dumbbell_shrug",
    "Shrug (Dumbbell)",
    "weight_reps",
    { traps: 1 },
    "Dumbbell_Shrug",
  ),

  // Shoulders
  ex(
    "overhead_press",
    "Overhead Press (Barbell)",
    "weight_reps",
    overhead,
    "Standing_Military_Press",
  ),
  ex(
    "seated_barbell_overhead_press",
    "Seated Overhead Press (Barbell)",
    "weight_reps",
    overhead,
    "Seated_Barbell_Military_Press",
  ),
  ex(
    "dumbbell_shoulder_press",
    "Seated Shoulder Press (Dumbbell)",
    "weight_reps",
    overhead,
    "Dumbbell_Shoulder_Press",
  ),
  ex(
    "arnold_press",
    "Arnold Press (Dumbbell)",
    "weight_reps",
    overhead,
    "Arnold_Dumbbell_Press",
  ),
  ex(
    "machine_shoulder_press",
    "Shoulder Press (Machine)",
    "weight_reps",
    overhead,
    "Leverage_Shoulder_Press",
  ),
  ex(
    "smith_machine_shoulder_press",
    "Shoulder Press (Smith)",
    "weight_reps",
    overhead,
    "Smith_Machine_Overhead_Shoulder_Press",
  ),
  ex(
    "dumbbell_lateral_raise",
    "Lateral Raise (Dumbbell)",
    "weight_reps",
    { side_delts: 1 },
    "Side_Lateral_Raise",
  ),
  ex("cable_lateral_raise", "Lateral Raise (Cable)", "weight_reps", {
    side_delts: 1,
  }),
  ex("machine_lateral_raise", "Lateral Raise (Machine)", "weight_reps", {
    side_delts: 1,
  }),
  ex(
    "dumbbell_front_raise",
    "Front Raise (Dumbbell)",
    "weight_reps",
    { front_delts: 1 },
    "Front_Dumbbell_Raise",
  ),
  ex(
    "dumbbell_rear_delt_fly",
    "Rear Delt Fly (Dumbbell)",
    "weight_reps",
    { rear_delts: 1, upper_back: 0.5 },
    "Reverse_Flyes",
  ),
  ex(
    "reverse_pec_deck",
    "Rear Delt Fly (Machine)",
    "weight_reps",
    { rear_delts: 1, upper_back: 0.5 },
    "Reverse_Machine_Flyes",
  ),
  ex(
    "cable_rear_delt_fly",
    "Rear Delt Fly (Cable)",
    "weight_reps",
    { rear_delts: 1 },
    "Cable_Rear_Delt_Fly",
  ),
  ex(
    "upright_row",
    "Upright Row (Barbell)",
    "weight_reps",
    { side_delts: 1, traps: 0.5, biceps: 0.5 },
    "Upright_Barbell_Row",
  ),

  // Arms
  ex(
    "barbell_curl",
    "Curl (Barbell)",
    "weight_reps",
    { biceps: 1, forearms: 0.5 },
    "Barbell_Curl",
  ),
  ex(
    "ez_bar_curl",
    "Curl (EZ Bar)",
    "weight_reps",
    { biceps: 1, forearms: 0.5 },
    "EZ-Bar_Curl",
  ),
  ex(
    "dumbbell_curl",
    "Curl (Dumbbell)",
    "weight_reps",
    { biceps: 1, forearms: 0.5 },
    "Dumbbell_Bicep_Curl",
  ),
  ex(
    "hammer_curl",
    "Hammer Curl (Dumbbell)",
    "weight_reps",
    { biceps: 1, forearms: 0.5 },
    "Hammer_Curls",
  ),
  ex(
    "incline_dumbbell_curl",
    "Incline Curl (Dumbbell)",
    "weight_reps",
    { biceps: 1 },
    "Incline_Dumbbell_Curl",
  ),
  ex(
    "preacher_curl",
    "Preacher Curl (EZ Bar)",
    "weight_reps",
    { biceps: 1 },
    "Preacher_Curl",
  ),
  ex(
    "machine_preacher_curl",
    "Preacher Curl (Machine)",
    "weight_reps",
    { biceps: 1 },
    "Machine_Preacher_Curls",
  ),
  ex(
    "cable_curl",
    "Curl (Cable)",
    "weight_reps",
    { biceps: 1 },
    "Standing_Biceps_Cable_Curl",
  ),
  ex(
    "concentration_curl",
    "Concentration Curl (Dumbbell)",
    "weight_reps",
    { biceps: 1 },
    "Concentration_Curls",
  ),
  ex(
    "reverse_curl",
    "Reverse Curl (Barbell)",
    "weight_reps",
    { forearms: 1, biceps: 0.5 },
    "Reverse_Barbell_Curl",
  ),
  ex(
    "wrist_curl",
    "Wrist Curl (Barbell)",
    "weight_reps",
    { forearms: 1 },
    "Palms-Up_Barbell_Wrist_Curl_Over_A_Bench",
  ),
  ex(
    "triceps_pushdown",
    "Triceps Pushdown (Bar)",
    "weight_reps",
    { triceps: 1 },
    "Triceps_Pushdown",
  ),
  ex(
    "rope_pushdown",
    "Triceps Pushdown (Rope)",
    "weight_reps",
    { triceps: 1 },
    "Triceps_Pushdown_-_Rope_Attachment",
  ),
  ex(
    "overhead_cable_triceps_extension",
    "Overhead Triceps Extension (Cable)",
    "weight_reps",
    { triceps: 1 },
    "Cable_Rope_Overhead_Triceps_Extension",
  ),
  ex(
    "dumbbell_overhead_triceps_extension",
    "Overhead Triceps Extension (Dumbbell)",
    "weight_reps",
    { triceps: 1 },
    "Standing_Dumbbell_Triceps_Extension",
  ),
  ex(
    "skull_crusher",
    "Skull Crusher (EZ Bar)",
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
    "Squat (Barbell)",
    "weight_reps",
    { quads: 1, glutes: 1, adductors: 0.5, lower_back: 0.5 },
    "Barbell_Squat",
  ),
  ex(
    "front_squat",
    "Front Squat (Barbell)",
    "weight_reps",
    { quads: 1, glutes: 0.5, upper_back: 0.5 },
    "Front_Barbell_Squat",
  ),
  ex(
    "goblet_squat",
    "Goblet Squat (Dumbbell)",
    "weight_reps",
    { quads: 1, glutes: 0.5 },
    "Goblet_Squat",
  ),
  ex(
    "hack_squat",
    "Hack Squat (Machine)",
    "weight_reps",
    { quads: 1, glutes: 0.5 },
    "Hack_Squat",
  ),
  ex(
    "smith_machine_squat",
    "Squat (Smith)",
    "weight_reps",
    { quads: 1, glutes: 0.5 },
    "Smith_Machine_Squat",
  ),
  ex(
    "leg_press",
    "Leg Press (Machine)",
    "weight_reps",
    { quads: 1, glutes: 0.5 },
    "Leg_Press",
  ),
  ex(
    "bulgarian_split_squat",
    "Bulgarian Split Squat (Dumbbell)",
    "weight_reps",
    { quads: 1, glutes: 1, adductors: 0.5 },
    "Split_Squat_with_Dumbbells",
  ),
  ex(
    "dumbbell_lunge",
    "Lunge (Dumbbell)",
    "weight_reps",
    { quads: 1, glutes: 1, adductors: 0.5 },
    "Dumbbell_Lunges",
  ),
  ex(
    "barbell_lunge",
    "Lunge (Barbell)",
    "weight_reps",
    { quads: 1, glutes: 1, adductors: 0.5 },
    "Barbell_Lunge",
  ),
  ex(
    "dumbbell_step_up",
    "Step-Up (Dumbbell)",
    "weight_reps",
    { quads: 1, glutes: 1 },
    "Dumbbell_Step_Ups",
  ),
  ex(
    "leg_extension",
    "Leg Extension (Machine)",
    "weight_reps",
    { quads: 1 },
    "Leg_Extensions",
  ),
  ex(
    "lying_leg_curl",
    "Lying Leg Curl (Machine)",
    "weight_reps",
    { hamstrings: 1 },
    "Lying_Leg_Curls",
  ),
  ex(
    "seated_leg_curl",
    "Seated Leg Curl (Machine)",
    "weight_reps",
    { hamstrings: 1 },
    "Seated_Leg_Curl",
  ),
  ex(
    "hip_thrust",
    "Hip Thrust (Barbell)",
    "weight_reps",
    { glutes: 1, hamstrings: 0.5 },
    "Barbell_Hip_Thrust",
  ),
  ex(
    "glute_bridge",
    "Glute Bridge (Barbell)",
    "weight_reps",
    { glutes: 1, hamstrings: 0.5 },
    "Barbell_Glute_Bridge",
  ),
  ex(
    "cable_pull_through",
    "Pull-Through (Cable)",
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
    "Standing Calf Raise (Machine)",
    "weight_reps",
    { calves: 1 },
    "Standing_Calf_Raises",
  ),
  ex(
    "seated_calf_raise",
    "Seated Calf Raise (Machine)",
    "weight_reps",
    { calves: 1 },
    "Seated_Calf_Raise",
  ),
  ex(
    "leg_press_calf_raise",
    "Calf Raise (Leg Press)",
    "weight_reps",
    { calves: 1 },
    "Calf_Press_On_The_Leg_Press_Machine",
  ),
  ex(
    "hip_adduction",
    "Hip Adduction (Machine)",
    "weight_reps",
    { adductors: 1 },
    "Thigh_Adductor",
  ),
  ex(
    "hip_abduction",
    "Hip Abduction (Machine)",
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
  ex("crunch", "Crunch (Bodyweight)", "reps", { abs: 1 }, "Crunches"),
  ex(
    "decline_crunch",
    "Decline Crunch",
    "bodyweight_reps",
    { abs: 1 },
    "Decline_Crunch",
  ),
  ex("reverse_crunch", "Reverse Crunch", "reps", { abs: 1 }, "Reverse_Crunch"),
  ex("sit_up", "Sit-Up", "reps", { abs: 1 }, "Sit-Up"),
  ex(
    "cable_crunch",
    "Crunch (Cable)",
    "weight_reps",
    { abs: 1 },
    "Cable_Crunch",
  ),
  ex(
    "machine_crunch",
    "Crunch (Machine)",
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
    "Running (Treadmill)",
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
    "Cycling (Stationary)",
    "distance_time",
    { quads: 1, glutes: 0.5, calves: 0.5 },
    "Bicycling_Stationary",
  ),
  ex(
    "rowing_machine",
    "Rowing (Machine)",
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
