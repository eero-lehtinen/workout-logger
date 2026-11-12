import type { Kysely } from "kysely";
import type { SetValues } from "../domain/markers.ts";
import { prefillNextSet } from "../domain/prefill.ts";
import type {
  Database,
  ExerciseType,
  SessionEndReason,
} from "../schema/tables.ts";
import { readSettings } from "../settings.ts";
import { defineQuery } from "./define.ts";
import {
  type LoggedSet,
  loadPerformances,
  markPerformanceSets,
  type Performance,
  stripSessionExercise,
} from "./performances.ts";

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
  /** The routine's reminder for the slot, e.g. "heavy, 6-10". */
  slotNote: string | null;
  /** The slot's default exercise, when this one substitutes it. */
  substitutesName: string | null;
  /** About this exercise in this session; `exercise.notes` is about the exercise. */
  notes: string;
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
      // Unlike `slot`, a slot deleted since still names what this exercise
      // substitutes, as in the session list.
      .leftJoin("slot as origin", "origin.id", "se.slot_id")
      .leftJoin(
        "exercise as originExercise",
        "originExercise.id",
        "origin.exercise_id",
      )
      .select([
        "se.id",
        "se.slot_id as slotId",
        "se.notes as sessionExerciseNotes",
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
        "slot.note as slotNote",
        "origin.exercise_id as slotExerciseId",
        "originExercise.name as slotExerciseName",
      ])
      .where("se.id", "=", args.sessionExerciseId)
      .where("se.deleted", "=", 0)
      .where("s.deleted", "=", 0)
      .where("e.deleted", "=", 0)
      .executeTakeFirst();
    if (!row) return null;
    const settings = await readSettings(db);

    const performances = await loadPerformances(db, row.exerciseId, {
      sessionId: row.sessionId,
      startedAt: row.startedAt,
    });
    const marked = markPerformanceSets(
      row.type,
      performances,
      settings.e1rm_rep_cap,
    );
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
      slotNote: row.slotNote,
      substitutesName:
        row.slotExerciseId && row.slotExerciseId !== row.exerciseId
          ? row.slotExerciseName
          : null,
      notes: row.sessionExerciseNotes,
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
