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
  type SessionSummary,
  sessionSummaries,
  toSummary,
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

export interface CalendarSession extends SessionSummary {
  /**
   * The day's index in its routine's cycle, for its color; null for ad hoc
   * sessions and deleted days.
   */
  dayIndex: number | null;
}

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
  async (
    db,
    args: { from: number; to: number },
  ): Promise<CalendarSession[]> => {
    const rows = await sessionSummaries(db)
      .where("s.started_at", ">=", args.from)
      .where("s.started_at", "<", args.to)
      .orderBy("s.started_at")
      .orderBy("s.id")
      .execute();
    const sessions = rows.map(toSummary);
    const dayIndex = await dayIndexes(
      db,
      sessions.flatMap((s) => s.routineId ?? []),
    );
    return sessions.map((s) => ({
      ...s,
      dayIndex: (s.dayId !== null ? dayIndex.get(s.dayId) : null) ?? null,
    }));
  },
);

/** Live day id → index in its routine's cycle. */
async function dayIndexes(
  db: Parameters<typeof sessionSummaries>[0],
  routineIds: string[],
): Promise<Map<string, number>> {
  const ids = [...new Set(routineIds)];
  if (ids.length === 0) return new Map();
  const days = await db
    .selectFrom("routine_day")
    .select(["id", "routine_id", "position"])
    .where("routine_id", "in", ids)
    .where("deleted", "=", 0)
    .execute();
  const map = new Map<string, number>();
  for (const id of ids) {
    days
      .filter((d) => d.routine_id === id)
      .sort(compareOrder)
      .forEach((d, i) => {
        map.set(d.id, i);
      });
  }
  return map;
}

export interface TrainingStats {
  sessions: {
    id: string;
    startedAt: number;
    tz: string;
    routineId: string | null;
    dayId: string | null;
    /** Muscle groups of the primary muscles of exercises with logged sets. */
    muscleGroups: string[];
  }[];
  /** Every muscle group in the catalog. */
  muscleGroups: string[];
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
    const trained = await db
      .selectFrom("session_exercise as se")
      .innerJoin("exercise as e", "e.id", "se.exercise_id")
      .innerJoin("exercise_muscle as em", "em.exercise_id", "e.id")
      .innerJoin("muscle as m", "m.id", "em.muscle_id")
      .select(["se.session_id as sessionId", "m.group_name as group"])
      .distinct()
      .where("se.deleted", "=", 0)
      .where("e.deleted", "=", 0)
      .where("em.deleted", "=", 0)
      .where("em.factor", "=", 1)
      .where("m.deleted", "=", 0)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom("set_log as sl")
            .select("sl.id")
            .whereRef("sl.session_exercise_id", "=", "se.id")
            .where("sl.deleted", "=", 0),
        ),
      )
      .execute();
    const groupsBySession = new Map<string, string[]>();
    for (const { sessionId, group } of trained) {
      const groups = groupsBySession.get(sessionId) ?? [];
      groups.push(group);
      groupsBySession.set(sessionId, groups);
    }
    const groups = await db
      .selectFrom("muscle")
      .select("group_name")
      .distinct()
      .where("deleted", "=", 0)
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
        muscleGroups: groupsBySession.get(s.id) ?? [],
      })),
      muscleGroups: groups.map((g) => g.group_name),
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
