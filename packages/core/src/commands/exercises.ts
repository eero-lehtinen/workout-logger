import type { ExerciseType } from "../schema/tables.ts";
import type { Writer } from "../store/write.ts";
import { defineCommand } from "./define.ts";

/** Muscle id → factor in 0..1. At least one primary muscle (factor 1). */
export type MuscleTargets = Readonly<Record<string, number>>;

export interface ExerciseFields {
  name: string;
  type: ExerciseType;
  defaultRestS: number | null;
  weightIncrementKg: number | null;
  notes: string;
}

export class InvalidMuscleTargetsError extends Error {
  constructor() {
    super("an exercise needs at least one primary muscle");
    this.name = "InvalidMuscleTargetsError";
  }
}

export const createExercise = defineCommand(
  async (
    w,
    args: ExerciseFields & { muscles: MuscleTargets },
  ): Promise<string> => {
    checkTargets(args.muscles);
    const id = await w.insert("exercise", {
      ...exerciseRow(args),
      archived: 0,
      builtin_key: null,
    });
    await writeTargets(w, id, args.muscles);
    return id;
  },
);

export const updateExercise = defineCommand(
  async (
    w,
    args: { exerciseId: string } & Partial<ExerciseFields> & {
        muscles?: MuscleTargets;
        archived?: boolean;
      },
  ): Promise<void> => {
    await w.update("exercise", args.exerciseId, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.type !== undefined && { type: args.type }),
      ...(args.defaultRestS !== undefined && {
        default_rest_s: args.defaultRestS,
      }),
      ...(args.weightIncrementKg !== undefined && {
        weight_increment_kg: args.weightIncrementKg,
      }),
      ...(args.notes !== undefined && { notes: args.notes }),
      ...(args.archived !== undefined && { archived: args.archived ? 1 : 0 }),
    });
    if (args.muscles) {
      checkTargets(args.muscles);
      await writeTargets(w, args.exerciseId, args.muscles);
    }
  },
);

function exerciseRow(fields: ExerciseFields) {
  return {
    name: fields.name,
    type: fields.type,
    default_rest_s: fields.defaultRestS,
    weight_increment_kg: fields.weightIncrementKg,
    notes: fields.notes,
  };
}

function checkTargets(muscles: MuscleTargets) {
  const factors = Object.values(muscles);
  if (!factors.includes(1) || factors.some((f) => !(f > 0 && f <= 1))) {
    throw new InvalidMuscleTargetsError();
  }
}

/** Makes the exercise's live targets equal `muscles`, reusing existing rows. */
async function writeTargets(
  w: Writer,
  exerciseId: string,
  muscles: MuscleTargets,
) {
  const existing = await w.db
    .selectFrom("exercise_muscle")
    .select(["id", "muscle_id", "factor", "deleted"])
    .where("exercise_id", "=", exerciseId)
    .execute();
  const byMuscle = new Map(existing.map((row) => [row.muscle_id, row]));
  for (const row of existing) {
    if (!row.deleted && !(row.muscle_id in muscles)) {
      await w.delete("exercise_muscle", row.id);
    }
  }
  for (const [muscleId, factor] of Object.entries(muscles)) {
    const row = byMuscle.get(muscleId);
    if (!row) {
      await w.insert("exercise_muscle", {
        exercise_id: exerciseId,
        muscle_id: muscleId,
        factor,
      });
    } else if (row.deleted || row.factor !== factor) {
      await w.put("exercise_muscle", row.id, {
        exercise_id: exerciseId,
        muscle_id: muscleId,
        factor,
      });
    }
  }
}
