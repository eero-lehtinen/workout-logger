import type { Kysely } from "kysely";
import {
  explainPerformances,
  type MarkerMeasure,
  type ProgressMarker,
  type SetValues,
} from "../domain/markers.ts";
import { prefillNextSet } from "../domain/prefill.ts";
import type {
  Database,
  ExerciseType,
  SessionEndReason,
} from "../schema/tables.ts";
import { readSettings } from "../settings.ts";
import { defineQuery } from "./define.ts";

export interface LoggedSet extends SetValues {
  id: string;
  loggedAt: number;
  marker: ProgressMarker | null;
  /** Why the set got its marker; null without one. */
  markerBasis: MarkerExplanation | null;
}

/** A marker's basis with the compared set resolved, for showing to the user. */
export interface MarkerExplanation {
  measure: MarkerMeasure;
  /** kg for e1rm and weight, reps, s, or m; null for weight_and_reps. */
  value: number | null;
  compared: number | null;
  /** The set it was compared with. */
  against: SetValues & {
    setNumber: number;
    startedAt: number;
    tz: string;
    /** True if it was an earlier set of the same session. */
    sameSession: boolean;
  };
}

export interface Performance {
  sessionId: string;
  startedAt: number;
  tz: string;
  sets: LoggedSet[];
}

export interface ExerciseLog {
  sessionExerciseId: string;
  session: {
    id: string;
    routineId: string | null;
    dayId: string | null;
    startedAt: number;
    endedAt: number | null;
    endReason: SessionEndReason | null;
    lastSetAt: number | null;
  };
  slotId: string | null;
  exercise: {
    id: string;
    name: string;
    type: ExerciseType;
    weightIncrementKg: number | null;
    notes: string;
  };
  /** Slot override > exercise default > the global default. */
  restSeconds: number;
  sets: LoggedSet[];
  /** Newest first: the previous performance, then older ones. */
  previous: Performance[];
  prefill: SetValues;
}

/** How many earlier performances the logging view can expand to. */
export const PREVIOUS_PERFORMANCES = 5;

export const exerciseLog = defineQuery(
  ["session", "session_exercise", "set_log", "exercise", "slot", "setting"],
  async (
    db,
    args: { sessionExerciseId: string },
  ): Promise<ExerciseLog | null> => {
    const row = await db
      .selectFrom("session_exercise as se")
      .innerJoin("session as s", "s.id", "se.session_id")
      .innerJoin("exercise as e", "e.id", "se.exercise_id")
      .leftJoin("slot", (join) =>
        join.onRef("slot.id", "=", "se.slot_id").on("slot.deleted", "=", 0),
      )
      .select([
        "se.id",
        "se.slot_id as slotId",
        "s.id as sessionId",
        "s.routine_id as routineId",
        "s.day_id as dayId",
        "s.started_at as startedAt",
        "s.ended_at as endedAt",
        "s.end_reason as endReason",
        "e.id as exerciseId",
        "e.name",
        "e.type",
        "e.weight_increment_kg as weightIncrementKg",
        "e.default_rest_s as defaultRestS",
        "e.notes",
        "slot.rest_s as slotRestS",
      ])
      .where("se.id", "=", args.sessionExerciseId)
      .where("se.deleted", "=", 0)
      .where("s.deleted", "=", 0)
      .where("e.deleted", "=", 0)
      .executeTakeFirst();
    if (!row) return null;
    const settings = await readSettings(db);

    const performances = await performancesUpTo(
      db,
      row.exerciseId,
      row.sessionId,
      row.startedAt,
    );
    const bases = explainPerformances(
      row.type,
      performances.map((p) => p.sets),
      { e1rmRepCap: settings.e1rm_rep_cap },
    );
    const explain = (i: number, j: number): MarkerExplanation | null => {
      const basis = bases[i]?.[j];
      if (!basis) return null;
      const where = performances[basis.against.performance];
      const set = where?.sets[basis.against.set];
      if (!where || !set) return null;
      return {
        measure: basis.measure,
        value: basis.value,
        compared: basis.compared,
        against: {
          weight_kg: set.weight_kg,
          reps: set.reps,
          duration_s: set.duration_s,
          distance_m: set.distance_m,
          setNumber: basis.against.set + 1,
          startedAt: where.startedAt,
          tz: where.tz,
          sameSession: basis.against.performance === i,
        },
      };
    };
    const marked = performances.map((p, i) => ({
      ...p,
      sets: p.sets.map((set, j) => ({
        ...set,
        marker: bases[i]?.[j]?.marker ?? null,
        markerBasis: explain(i, j),
      })),
    }));
    const current =
      marked.at(-1)?.sessionId === row.sessionId ? marked.pop() : undefined;
    const sets = (current?.sets ?? []).filter(
      (s) => s.sessionExerciseId === row.id,
    );
    const previous = marked.reverse().slice(0, PREVIOUS_PERFORMANCES);

    return {
      sessionExerciseId: row.id,
      session: {
        id: row.sessionId,
        routineId: row.routineId,
        dayId: row.dayId,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        endReason: row.endReason,
        lastSetAt: await lastSetAt(db, row.sessionId),
      },
      slotId: row.slotId,
      exercise: {
        id: row.exerciseId,
        name: row.name,
        type: row.type,
        weightIncrementKg: row.weightIncrementKg,
        notes: row.notes,
      },
      restSeconds: row.slotRestS ?? row.defaultRestS ?? settings.rest_default_s,
      sets: sets.map(stripSessionExercise),
      previous: previous.map((p) => ({
        ...p,
        sets: p.sets.map(stripSessionExercise),
      })),
      prefill: prefillNextSet(sets, previous[0]?.sets ?? null),
    };
  },
);

function stripSessionExercise({
  sessionExerciseId: _,
  ...set
}: LoggedSet & { sessionExerciseId: string }): LoggedSet {
  return set;
}

type RawSet = Omit<LoggedSet, "marker" | "markerBasis"> & {
  sessionExerciseId: string;
};

/**
 * Every performance of the exercise from the first one through the given
 * session, oldest first. A session that has the exercise twice counts as one
 * performance, in session order.
 */
async function performancesUpTo(
  db: Kysely<Database>,
  exerciseId: string,
  sessionId: string,
  startedAt: number,
): Promise<
  { sessionId: string; startedAt: number; tz: string; sets: RawSet[] }[]
> {
  const rows = await db
    .selectFrom("set_log as sl")
    .innerJoin("session_exercise as se", "se.id", "sl.session_exercise_id")
    .innerJoin("session as s", "s.id", "se.session_id")
    .select([
      "s.id as sessionId",
      "s.started_at as startedAt",
      "s.tz",
      "sl.id",
      "sl.session_exercise_id as sessionExerciseId",
      "sl.logged_at as loggedAt",
      "sl.weight_kg",
      "sl.reps",
      "sl.duration_s",
      "sl.distance_m",
    ])
    .where("se.exercise_id", "=", exerciseId)
    .where("sl.deleted", "=", 0)
    .where("se.deleted", "=", 0)
    .where("s.deleted", "=", 0)
    .where((eb) =>
      eb.or([
        eb("s.started_at", "<", startedAt),
        eb.and([
          eb("s.started_at", "=", startedAt),
          eb("s.id", "<=", sessionId),
        ]),
      ]),
    )
    .orderBy("s.started_at")
    .orderBy("s.id")
    .orderBy("se.position")
    .orderBy("se.id")
    .orderBy("sl.position")
    .orderBy("sl.id")
    .execute();

  const performances: {
    sessionId: string;
    startedAt: number;
    tz: string;
    sets: RawSet[];
  }[] = [];
  for (const { sessionId: id, startedAt: at, tz, ...set } of rows) {
    let last = performances.at(-1);
    if (last?.sessionId !== id) {
      last = { sessionId: id, startedAt: at, tz, sets: [] };
      performances.push(last);
    }
    last.sets.push(set);
  }
  return performances;
}

async function lastSetAt(db: Kysely<Database>, sessionId: string) {
  const row = await db
    .selectFrom("set_log as sl")
    .innerJoin("session_exercise as se", "se.id", "sl.session_exercise_id")
    .select((eb) => eb.fn.max("sl.logged_at").as("t"))
    .where("se.session_id", "=", sessionId)
    .where("se.deleted", "=", 0)
    .where("sl.deleted", "=", 0)
    .executeTakeFirst();
  return row?.t ?? null;
}
