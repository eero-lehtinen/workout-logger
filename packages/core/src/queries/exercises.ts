import { type BestSet, bestSet } from "../domain/best-set.ts";
import { compareOrder } from "../domain/position.ts";
import type { ExerciseType } from "../schema/tables.ts";
import { readSettings } from "../settings.ts";
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
  /** Its latest logged set; null if it was never logged. */
  lastLoggedAt: number | null;
  loggedSets: number;
  /** Null if it was never logged, or no set has a value for its records. */
  best: BestSet | null;
}

/** Every live exercise, archived ones included, sorted by name. */
export const exercises = defineQuery(
  [
    "exercise",
    "exercise_muscle",
    "muscle",
    "session",
    "session_exercise",
    "set_log",
    "setting",
  ],
  async (db): Promise<ExerciseItem[]> => {
    const { e1rm_rep_cap } = await readSettings(db);
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
    // The only scan over every set: it dominates the query's cost, and a
    // second one, e.g. for a distinct session count, would double it.
    const logged = await db
      .selectFrom("set_log as sl")
      .innerJoin("session_exercise as se", "se.id", "sl.session_exercise_id")
      .innerJoin("session as s", "s.id", "se.session_id")
      .select((eb) => [
        "se.exercise_id as exerciseId",
        "sl.reps",
        eb.fn.countAll<number>().as("sets"),
        eb.fn.max("sl.logged_at").as("last"),
        eb.fn.max("sl.weight_kg").as("maxWeightKg"),
        eb.fn.max("sl.duration_s").as("maxDurationS"),
        eb.fn.max("sl.distance_m").as("maxDistanceM"),
      ])
      .where("sl.deleted", "=", 0)
      .where("se.deleted", "=", 0)
      .where("s.deleted", "=", 0)
      .groupBy(["se.exercise_id", "sl.reps"])
      .execute();
    const usage = new Map<string, typeof logged>();
    for (const g of logged) {
      const groups = usage.get(g.exerciseId) ?? [];
      groups.push(g);
      usage.set(g.exerciseId, groups);
    }
    const muscleMap = new Map<string, Record<string, number>>();
    for (const t of targets) {
      const map = muscleMap.get(t.exercise_id) ?? {};
      map[t.muscle_id] = t.factor;
      muscleMap.set(t.exercise_id, map);
    }
    return rows
      .map((r) => {
        const groups = usage.get(r.id) ?? [];
        return {
          id: r.id,
          name: r.name,
          type: r.type,
          archived: r.archived === 1,
          builtin: r.builtin_key !== null,
          muscles: muscleMap.get(r.id) ?? {},
          lastLoggedAt:
            groups.length > 0 ? Math.max(...groups.map((g) => g.last)) : null,
          loggedSets: groups.reduce((sum, g) => sum + g.sets, 0),
          best: bestSet(r.type, groups, { e1rmRepCap: e1rm_rep_cap }),
        };
      })
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
  /**
   * The slot's default exercise and its alternatives, in slot order, without
   * the exercise being replaced.
   */
  alternativeIds: string[];
}

/**
 * The substitution picker's first group. The rest of the picker is the
 * `exercises` query, filtered to the replaced exercise's muscle group.
 */
export const substitutionOptions = defineQuery(
  ["slot", "slot_alternative"],
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
    return {
      alternativeIds: alternativeIds.filter((id) => id !== args.exerciseId),
    };
  },
);
