import { compareOrder } from "../domain/position.ts";
import type { ExerciseType } from "../schema/tables.ts";
import { defineQuery } from "./define.ts";

export interface MuscleItem {
  id: string;
  name: string;
  group: string;
}

export const muscles = defineQuery(
  ["muscle"],
  async (db): Promise<MuscleItem[]> =>
    db
      .selectFrom("muscle")
      .select(["id", "name", "group_name as group"])
      .where("deleted", "=", 0)
      .orderBy("name")
      .execute(),
);

export interface ExerciseItem {
  id: string;
  name: string;
  type: ExerciseType;
  archived: boolean;
  builtin: boolean;
  /** Muscle id → factor. */
  muscles: Record<string, number>;
  /** Start of the latest live session that included it. */
  lastUsedAt: number | null;
}

/** Every live exercise, archived ones included, sorted by name. */
export const exercises = defineQuery(
  ["exercise", "exercise_muscle", "muscle", "session", "session_exercise"],
  async (db): Promise<ExerciseItem[]> => {
    const rows = await db
      .selectFrom("exercise")
      .select(["id", "name", "type", "archived", "builtin_key"])
      .where("deleted", "=", 0)
      .execute();
    const targets = await db
      .selectFrom("exercise_muscle as em")
      .innerJoin("muscle as m", "m.id", "em.muscle_id")
      .select(["em.exercise_id", "em.muscle_id", "em.factor"])
      .where("em.deleted", "=", 0)
      .where("m.deleted", "=", 0)
      .execute();
    const used = await db
      .selectFrom("session_exercise as se")
      .innerJoin("session as s", "s.id", "se.session_id")
      .select((eb) => ["se.exercise_id", eb.fn.max("s.started_at").as("t")])
      .where("se.deleted", "=", 0)
      .where("s.deleted", "=", 0)
      .groupBy("se.exercise_id")
      .execute();
    const lastUsed = new Map(used.map((u) => [u.exercise_id, u.t]));
    const muscleMap = new Map<string, Record<string, number>>();
    for (const t of targets) {
      const map = muscleMap.get(t.exercise_id) ?? {};
      map[t.muscle_id] = t.factor;
      muscleMap.set(t.exercise_id, map);
    }
    return rows
      .map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        archived: r.archived === 1,
        builtin: r.builtin_key !== null,
        muscles: muscleMap.get(r.id) ?? {},
        lastUsedAt: lastUsed.get(r.id) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
);

export interface ExerciseDetail {
  id: string;
  name: string;
  type: ExerciseType;
  defaultRestS: number | null;
  weightIncrementKg: number | null;
  notes: string;
  archived: boolean;
  builtin: boolean;
  muscles: Record<string, number>;
}

export const exerciseDetail = defineQuery(
  ["exercise", "exercise_muscle"],
  async (db, args: { exerciseId: string }): Promise<ExerciseDetail | null> => {
    const row = await db
      .selectFrom("exercise")
      .selectAll()
      .where("id", "=", args.exerciseId)
      .where("deleted", "=", 0)
      .executeTakeFirst();
    if (!row) return null;
    const targets = await db
      .selectFrom("exercise_muscle")
      .select(["muscle_id", "factor"])
      .where("exercise_id", "=", args.exerciseId)
      .where("deleted", "=", 0)
      .execute();
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      defaultRestS: row.default_rest_s,
      weightIncrementKg: row.weight_increment_kg,
      notes: row.notes,
      archived: row.archived === 1,
      builtin: row.builtin_key !== null,
      muscles: Object.fromEntries(targets.map((t) => [t.muscle_id, t.factor])),
    };
  },
);

export interface SubstitutionOptions {
  /** The slot's default exercise and its alternatives, in slot order. */
  alternativeIds: string[];
  /** Exercises sharing a primary muscle, most recently used first. */
  similarIds: string[];
}

/**
 * The first two groups of the substitution picker. The third, search across
 * all exercises, uses the `exercises` query.
 */
export const substitutionOptions = defineQuery(
  [
    "slot",
    "slot_alternative",
    "exercise",
    "exercise_muscle",
    "session",
    "session_exercise",
  ],
  async (
    db,
    args: { exerciseId: string | null; slotId: string | null },
  ): Promise<SubstitutionOptions> => {
    const alternativeIds: string[] = [];
    if (args.slotId) {
      const slot = await db
        .selectFrom("slot")
        .select("exercise_id")
        .where("id", "=", args.slotId)
        .where("deleted", "=", 0)
        .executeTakeFirst();
      if (slot) alternativeIds.push(slot.exercise_id);
      const alternatives = await db
        .selectFrom("slot_alternative")
        .select(["id", "position", "exercise_id"])
        .where("slot_id", "=", args.slotId)
        .where("deleted", "=", 0)
        .execute();
      for (const a of alternatives.sort(compareOrder)) {
        if (!alternativeIds.includes(a.exercise_id)) {
          alternativeIds.push(a.exercise_id);
        }
      }
    }

    let similarIds: string[] = [];
    if (args.exerciseId) {
      const rows = await db
        .selectFrom("exercise_muscle as mine")
        .innerJoin(
          "exercise_muscle as other",
          "other.muscle_id",
          "mine.muscle_id",
        )
        .innerJoin("exercise as e", "e.id", "other.exercise_id")
        .leftJoin("session_exercise as se", (join) =>
          join.onRef("se.exercise_id", "=", "e.id").on("se.deleted", "=", 0),
        )
        .leftJoin("session as s", (join) =>
          join.onRef("s.id", "=", "se.session_id").on("s.deleted", "=", 0),
        )
        .select((eb) => ["e.id", "e.name", eb.fn.max("s.started_at").as("t")])
        .where("mine.exercise_id", "=", args.exerciseId)
        .where("mine.factor", "=", 1)
        .where("mine.deleted", "=", 0)
        .where("other.factor", "=", 1)
        .where("other.deleted", "=", 0)
        .where("e.deleted", "=", 0)
        .where("e.archived", "=", 0)
        .where("e.id", "!=", args.exerciseId)
        .groupBy(["e.id", "e.name"])
        .execute();
      similarIds = rows
        .sort(
          (a, b) =>
            (b.t ?? -Infinity) - (a.t ?? -Infinity) ||
            a.name.localeCompare(b.name),
        )
        .map((r) => r.id)
        .filter((id) => !alternativeIds.includes(id));
    }
    return {
      alternativeIds: alternativeIds.filter((id) => id !== args.exerciseId),
      similarIds,
    };
  },
);
