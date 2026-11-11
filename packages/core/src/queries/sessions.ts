import { type Kysely, sql } from "kysely";
import type { ProgressMarker, SetValues } from "../domain/markers.ts";
import { nextDay } from "../domain/next-day.ts";
import { compareOrder } from "../domain/position.ts";
import type {
  Database,
  ExerciseType,
  SessionEndReason,
} from "../schema/tables.ts";
import { readSettings } from "../settings.ts";
import { defineQuery } from "./define.ts";
import { loadPerformances, markPerformanceSets } from "./performances.ts";

export interface SessionSummary {
  id: string;
  routineId: string | null;
  dayId: string | null;
  routineName: string | null;
  dayName: string | null;
  startedAt: number;
  tz: string;
  endedAt: number | null;
  endReason: SessionEndReason | null;
  notes: string;
  exerciseCount: number;
  setCount: number;
  /** For idle auto-end: effectiveSessionEnd(session, lastSetAt, now). */
  lastSetAt: number | null;
}

/** Live session exercises of live sessions, on live exercises. */
function liveSessionExercises(db: Kysely<Database>) {
  return db
    .selectFrom("session_exercise as se")
    .innerJoin("exercise as e", "e.id", "se.exercise_id")
    .where("se.deleted", "=", 0)
    .where("e.deleted", "=", 0);
}

export function sessionSummaries(db: Kysely<Database>) {
  return db
    .selectFrom("session as s")
    .leftJoin("routine as r", "r.id", "s.routine_id")
    .leftJoin("routine_day as d", "d.id", "s.day_id")
    .where("s.deleted", "=", 0)
    .select((eb) => {
      const exercises = () =>
        eb
          .selectFrom("session_exercise as se")
          .innerJoin("exercise as e", "e.id", "se.exercise_id")
          .whereRef("se.session_id", "=", "s.id")
          .where("se.deleted", "=", 0)
          .where("e.deleted", "=", 0);
      const sets = () =>
        exercises()
          .innerJoin("set_log as sl", "sl.session_exercise_id", "se.id")
          .where("sl.deleted", "=", 0);
      return [
        "s.id",
        "s.routine_id as routineId",
        "s.day_id as dayId",
        "r.name as routineName",
        "d.name as dayName",
        "s.started_at as startedAt",
        "s.tz",
        "s.ended_at as endedAt",
        "s.end_reason as endReason",
        "s.notes",
        exercises()
          .select((e) => e.fn.countAll<number>().as("n"))
          .as("exerciseCount"),
        sets()
          .select((e) => e.fn.countAll<number>().as("n"))
          .as("setCount"),
        sets()
          .select((e) => e.fn.max("sl.logged_at").as("t"))
          .as("lastSetAt"),
      ];
    });
}
export function toSummary(row: {
  exerciseCount: number | null;
  setCount: number | null;
  [key: string]: unknown;
}): SessionSummary {
  return {
    ...row,
    exerciseCount: row.exerciseCount ?? 0,
    setCount: row.setCount ?? 0,
  } as SessionSummary;
}

export interface ListedSession extends SessionSummary {
  /**
   * The day's index in its routine's cycle, for its color; null for ad hoc
   * sessions and deleted days.
   */
  dayIndex: number | null;
}

export async function withDayIndexes(
  db: Kysely<Database>,
  sessions: SessionSummary[],
): Promise<ListedSession[]> {
  const routineIds = [...new Set(sessions.flatMap((s) => s.routineId ?? []))];
  const index = new Map<string, number>();
  if (routineIds.length > 0) {
    const days = await db
      .selectFrom("routine_day")
      .select(["id", "routine_id", "position"])
      .where("routine_id", "in", routineIds)
      .where("deleted", "=", 0)
      .execute();
    for (const id of routineIds) {
      days
        .filter((d) => d.routine_id === id)
        .sort(compareOrder)
        .forEach((d, i) => {
          index.set(d.id, i);
        });
    }
  }
  return sessions.map((s) => ({
    ...s,
    dayIndex: (s.dayId !== null ? index.get(s.dayId) : null) ?? null,
  }));
}

export const recentSessions = defineQuery(
  [
    "session",
    "session_exercise",
    "set_log",
    "exercise",
    "routine",
    "routine_day",
  ],
  async (db, args: { limit: number }): Promise<ListedSession[]> => {
    const rows = await sessionSummaries(db)
      .orderBy("s.started_at", "desc")
      .orderBy("s.id", "desc")
      .limit(args.limit)
      .execute();
    return withDayIndexes(db, rows.map(toSummary));
  },
);

export interface StartDay {
  id: string;
  name: string;
  /** The names of the day's exercises, in slot order. */
  exercises: string[];
}

export interface StartOptions {
  routines: {
    id: string;
    name: string;
    days: StartDay[];
    lastDayId: string | null;
    nextDayId: string | null;
  }[];
  /** The routine of the latest session that had one, if it's still listed. */
  preselectedRoutineId: string | null;
}

export const startOptions = defineQuery(
  ["routine", "routine_day", "slot", "exercise", "session"],
  async (db): Promise<StartOptions> => {
    const routines = await db
      .selectFrom("routine")
      .select(["id", "name", "position"])
      .where("deleted", "=", 0)
      .where("archived", "=", 0)
      .execute();
    const days = await db
      .selectFrom("routine_day")
      .select(["id", "routine_id", "name", "position", "deleted"])
      .execute();
    // SQLite returns the bare columns of the row that holds the max.
    const latest = await sql<{
      routine_id: string;
      day_id: string | null;
      started_at: number;
    }>`
      select routine_id, day_id, max(started_at) as started_at
      from session
      where deleted = 0 and routine_id is not null
      group by routine_id`.execute(db);
    const lastByRoutine = new Map(
      latest.rows.map((r) => [r.routine_id, r] as const),
    );
    // Slots on deleted exercises have nothing to show.
    const slots = await db
      .selectFrom("slot")
      .innerJoin("exercise", "exercise.id", "slot.exercise_id")
      .select(["slot.id", "slot.day_id", "slot.position", "exercise.name"])
      .where("slot.deleted", "=", 0)
      .where("exercise.deleted", "=", 0)
      .execute();
    const exercisesOf = (dayId: string) =>
      slots
        .filter((s) => s.day_id === dayId)
        .sort(compareOrder)
        .map((s) => s.name);

    const listed = routines.sort(compareOrder).map((routine) => {
      const routineDays = days.filter((d) => d.routine_id === routine.id);
      const lastDayId = lastByRoutine.get(routine.id)?.day_id ?? null;
      return {
        id: routine.id,
        name: routine.name,
        days: routineDays
          .filter((d) => !d.deleted)
          .sort(compareOrder)
          .map((d) => ({
            id: d.id,
            name: d.name,
            exercises: exercisesOf(d.id),
          })),
        lastDayId,
        nextDayId: nextDay(routineDays, lastDayId),
      };
    });
    const mostRecent = [...lastByRoutine.values()].sort(
      (a, b) => b.started_at - a.started_at,
    )[0];
    const preselected = listed.find((r) => r.id === mostRecent?.routine_id);
    return {
      routines: listed,
      preselectedRoutineId: preselected?.id ?? listed[0]?.id ?? null,
    };
  },
);

export interface SessionExerciseItem {
  id: string;
  exerciseId: string;
  name: string;
  type: ExerciseType;
  slotId: string | null;
  /** The slot's default exercise, when this one substitutes it. */
  substitutesName: string | null;
  /** About this exercise in this session, e.g. imported set comments. */
  notes: string;
  /** With the markers they earned against the exercise's earlier history. */
  sets: (SetValues & { id: string; marker: ProgressMarker | null })[];
}

export interface SessionView {
  session: SessionSummary;
  exercises: SessionExerciseItem[];
}

export const sessionView = defineQuery(
  [
    "session",
    "session_exercise",
    "set_log",
    "exercise",
    "routine",
    "routine_day",
    "slot",
    "setting",
  ],
  async (db, args: { sessionId: string }): Promise<SessionView | null> => {
    const session = await sessionSummaries(db)
      .where("s.id", "=", args.sessionId)
      .executeTakeFirst();
    if (!session) return null;

    const exercises = await liveSessionExercises(db)
      .leftJoin("slot", "slot.id", "se.slot_id")
      .leftJoin(
        "exercise as slotExercise",
        "slotExercise.id",
        "slot.exercise_id",
      )
      .select([
        "se.id",
        "se.position",
        "se.exercise_id as exerciseId",
        "se.slot_id as slotId",
        "se.notes",
        "e.name",
        "e.type",
        "slot.exercise_id as slotExerciseId",
        "slotExercise.name as slotExerciseName",
      ])
      .where("se.session_id", "=", args.sessionId)
      .execute();
    const sets = await db
      .selectFrom("set_log")
      .innerJoin(
        "session_exercise",
        "session_exercise.id",
        "set_log.session_exercise_id",
      )
      .select([
        "set_log.id",
        "set_log.position",
        "set_log.session_exercise_id",
        "set_log.weight_kg",
        "set_log.reps",
        "set_log.duration_s",
        "set_log.distance_m",
      ])
      .where("session_exercise.session_id", "=", args.sessionId)
      .where("set_log.deleted", "=", 0)
      .execute();
    sets.sort(compareOrder);
    const markers = await sessionMarkers(
      db,
      args.sessionId,
      session.startedAt,
      exercises,
    );

    return {
      session: toSummary(session),
      exercises: exercises.sort(compareOrder).map((e) => ({
        id: e.id,
        exerciseId: e.exerciseId,
        name: e.name,
        type: e.type,
        slotId: e.slotId,
        substitutesName:
          e.slotExerciseId && e.slotExerciseId !== e.exerciseId
            ? e.slotExerciseName
            : null,
        notes: e.notes,
        sets: sets
          .filter((s) => s.session_exercise_id === e.id)
          .map(({ id, weight_kg, reps, duration_s, distance_m }) => ({
            id,
            weight_kg,
            reps,
            duration_s,
            distance_m,
            marker: markers.get(id) ?? null,
          })),
      })),
    };
  },
);

/**
 * Set id → marker for the session's sets, each judged against its
 * exercise's history up to this session, as the logging view does.
 */
async function sessionMarkers(
  db: Kysely<Database>,
  sessionId: string,
  startedAt: number,
  exercises: readonly { exerciseId: string; type: ExerciseType }[],
): Promise<Map<string, ProgressMarker | null>> {
  const { e1rm_rep_cap } = await readSettings(db);
  const markers = new Map<string, ProgressMarker | null>();
  const types = new Map(exercises.map((e) => [e.exerciseId, e.type]));
  for (const [exerciseId, type] of types) {
    const performances = await loadPerformances(db, exerciseId, {
      sessionId,
      startedAt,
    });
    const current = markPerformanceSets(type, performances, e1rm_rep_cap).at(
      -1,
    );
    if (current?.sessionId !== sessionId) continue;
    for (const set of current.sets) markers.set(set.id, set.marker);
  }
  return markers;
}
