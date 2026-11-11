import {
  type TrainedExercise,
  type WeightedSets,
  weightedSets,
} from "../domain/frequency.ts";
import { type ExerciseRecords, exerciseRecords } from "../domain/history.ts";
import { compareOrder } from "../domain/position.ts";
import type { ExerciseType } from "../schema/tables.ts";
import { readSettings } from "../settings.ts";
import { defineQuery } from "./define.ts";
import {
  loadPerformances,
  markPerformanceSets,
  type Performance,
  stripSessionExercise,
} from "./performances.ts";
import {
  type ListedSession,
  sessionSummaries,
  toSummary,
  withDayIndexes,
} from "./sessions.ts";

export interface ExerciseHistory {
  exercise: {
    id: string;
    name: string;
    type: ExerciseType;
    archived: boolean;
  };
  /** Oldest first, with markers as they were at the time. */
  performances: Performance[];
  records: ExerciseRecords;
  e1rmRepCap: number;
}

export const exerciseHistory = defineQuery(
  ["session", "session_exercise", "set_log", "exercise", "setting"],
  async (db, args: { exerciseId: string }): Promise<ExerciseHistory | null> => {
    const exercise = await db
      .selectFrom("exercise")
      .select(["id", "name", "type", "archived"])
      .where("id", "=", args.exerciseId)
      .where("deleted", "=", 0)
      .executeTakeFirst();
    if (!exercise) return null;
    const settings = await readSettings(db);
    const cap = settings.e1rm_rep_cap;
    const performances = markPerformanceSets(
      exercise.type,
      await loadPerformances(db, exercise.id),
      cap,
    ).map((p) => ({ ...p, sets: p.sets.map(stripSessionExercise) }));
    return {
      exercise: { ...exercise, archived: exercise.archived === 1 },
      performances,
      records: exerciseRecords(exercise.type, performances, {
        e1rmRepCap: cap,
      }),
      e1rmRepCap: cap,
    };
  },
);

/** Sessions that started in `[from, to)`, oldest first. */
export const sessionsInRange = defineQuery(
  [
    "session",
    "session_exercise",
    "set_log",
    "exercise",
    "routine",
    "routine_day",
  ],
  async (db, args: { from: number; to: number }): Promise<ListedSession[]> => {
    const rows = await sessionSummaries(db)
      .where("s.started_at", ">=", args.from)
      .where("s.started_at", "<", args.to)
      .orderBy("s.started_at")
      .orderBy("s.id")
      .execute();
    return withDayIndexes(db, rows.map(toSummary));
  },
);

export interface TrainingStats {
  sessions: {
    id: string;
    startedAt: number;
    tz: string;
    routineId: string | null;
    dayId: string | null;
    weightedSets: WeightedSets;
  }[];
  /** Every live muscle, by name. */
  muscles: { id: string; name: string; group: string }[];
  /** Live routines with their live days in cycle order. */
  routines: {
    id: string;
    name: string;
    archived: boolean;
    days: { id: string; name: string; index: number }[];
  }[];
}

/** Everything the frequency stats are computed from, for all time. */
export const trainingStats = defineQuery(
  [
    "session",
    "session_exercise",
    "set_log",
    "exercise",
    "exercise_muscle",
    "muscle",
    "routine",
    "routine_day",
  ],
  async (db): Promise<TrainingStats> => {
    const sessions = await db
      .selectFrom("session")
      .select([
        "id",
        "started_at as startedAt",
        "tz",
        "routine_id as routineId",
        "day_id as dayId",
      ])
      .where("deleted", "=", 0)
      .orderBy("started_at")
      .execute();
    // One row per session exercise and muscle target, with its set count.
    const targets = await db
      .selectFrom("session_exercise as se")
      .innerJoin("exercise as e", "e.id", "se.exercise_id")
      .innerJoin("exercise_muscle as em", "em.exercise_id", "e.id")
      .innerJoin("muscle as m", "m.id", "em.muscle_id")
      .select((eb) => [
        "se.session_id as sessionId",
        "se.id as sessionExerciseId",
        "em.muscle_id as muscleId",
        "m.group_name as group",
        "em.factor",
        eb
          .selectFrom("set_log as sl")
          .select((c) => c.fn.countAll<number>().as("n"))
          .whereRef("sl.session_exercise_id", "=", "se.id")
          .where("sl.deleted", "=", 0)
          .as("sets"),
      ])
      .where("se.deleted", "=", 0)
      .where("e.deleted", "=", 0)
      .where("em.deleted", "=", 0)
      .where("m.deleted", "=", 0)
      .execute();
    const bySession = new Map<string, Map<string, TrainedExercise>>();
    for (const t of targets) {
      if (!t.sets) continue;
      const exercises = bySession.get(t.sessionId) ?? new Map();
      bySession.set(t.sessionId, exercises);
      const exercise: TrainedExercise = exercises.get(t.sessionExerciseId) ?? {
        sets: t.sets,
        targets: [],
      };
      exercises.set(t.sessionExerciseId, {
        ...exercise,
        targets: [...exercise.targets, t],
      });
    }
    const muscles = await db
      .selectFrom("muscle")
      .select(["id", "name", "group_name as group"])
      .where("deleted", "=", 0)
      .orderBy("name")
      .execute();
    const routines = await db
      .selectFrom("routine")
      .select(["id", "name", "position", "archived"])
      .where("deleted", "=", 0)
      .execute();
    const days = await db
      .selectFrom("routine_day")
      .select(["id", "routine_id", "name", "position"])
      .where("deleted", "=", 0)
      .execute();
    days.sort(compareOrder);

    return {
      sessions: sessions.map((s) => ({
        ...s,
        weightedSets: weightedSets([...(bySession.get(s.id)?.values() ?? [])]),
      })),
      muscles,
      routines: routines.sort(compareOrder).map((r) => ({
        id: r.id,
        name: r.name,
        archived: r.archived === 1,
        days: days
          .filter((d) => d.routine_id === r.id)
          .map((d, index) => ({ id: d.id, name: d.name, index })),
      })),
    };
  },
);
