import type { SetValues } from "../domain/markers.ts";
import { compareOrder, positionBetween } from "../domain/position.ts";
import { effectiveSessionEnd } from "../domain/session-end.ts";
import { readSettings } from "../settings.ts";
import type { Writer } from "../store/write.ts";
import { defineCommand } from "./define.ts";
import { appendPosition, liveSiblings, moveInList } from "./order.ts";

/**
 * Creates a session that starts now: starting it is the manual start of the
 * session timer. A routine day's slots become its exercises, in slot order.
 */
export const startSession = defineCommand(
  async (
    w,
    args: {
      routineId: string | null;
      dayId: string | null;
      /** Copy the day's slots as session exercises. Default true. */
      withSlots?: boolean;
    },
    ctx,
  ): Promise<string> => {
    const sessionId = await w.insert("session", {
      routine_id: args.routineId,
      day_id: args.dayId,
      started_at: ctx.now,
      tz: ctx.tz,
      notes: "",
    });
    if (!args.dayId || args.withSlots === false) return sessionId;

    const slots = await w.db
      .selectFrom("slot")
      .innerJoin("exercise", "exercise.id", "slot.exercise_id")
      .select(["slot.id", "slot.position", "slot.exercise_id"])
      .where("slot.day_id", "=", args.dayId)
      .where("slot.deleted", "=", 0)
      .where("exercise.deleted", "=", 0)
      .execute();
    let position: string | null = null;
    for (const slot of slots.sort(compareOrder)) {
      position = await nextPosition(w, sessionId, position);
      await w.insert("session_exercise", {
        session_id: sessionId,
        slot_id: slot.id,
        exercise_id: slot.exercise_id,
        position,
        notes: "",
      });
    }
    return sessionId;
  },
);

async function nextPosition(
  w: Writer,
  sessionId: string,
  previous: string | null,
): Promise<string> {
  if (previous === null) {
    return appendPosition(w, "session_exercise", "session_id", sessionId);
  }
  return positionBetween(previous, null);
}

/**
 * A manual stop. A session that has already idled out ends at its last
 * activity, as idle auto-end would show it, not at the time of the tap.
 */
export const endSession = defineCommand(
  async (w, args: { sessionId: string }, ctx): Promise<void> => {
    const session = await w.db
      .selectFrom("session")
      .select(["started_at", "ended_at", "end_reason"])
      .where("id", "=", args.sessionId)
      .executeTakeFirstOrThrow();
    if (session.ended_at !== null) return;
    const settings = await readSettings(w.db);
    const end = effectiveSessionEnd(
      session,
      await lastSetAt(w, args.sessionId),
      ctx.now,
      settings.idle_threshold_s * 1000,
    );
    await w.update("session", args.sessionId, {
      ended_at: end.running ? ctx.now : end.endedAt,
      end_reason: "manual",
    });
  },
);

/** Continues a manually ended session. */
export const resumeSession = defineCommand(
  async (w, args: { sessionId: string }): Promise<void> => {
    await w.update("session", args.sessionId, {
      ended_at: null,
      end_reason: null,
    });
  },
);

export const deleteSession = defineCommand(
  async (w, args: { sessionId: string }): Promise<void> => {
    await w.delete("session", args.sessionId);
  },
);

export const updateSessionNotes = defineCommand(
  async (w, args: { sessionId: string; notes: string }): Promise<void> => {
    await w.update("session", args.sessionId, { notes: args.notes });
  },
);

async function lastSetAt(w: Writer, sessionId: string) {
  const row = await w.db
    .selectFrom("set_log")
    .innerJoin(
      "session_exercise",
      "session_exercise.id",
      "set_log.session_exercise_id",
    )
    .select((eb) => eb.fn.max("set_log.logged_at").as("last"))
    .where("session_exercise.session_id", "=", sessionId)
    .where("session_exercise.deleted", "=", 0)
    .where("set_log.deleted", "=", 0)
    .executeTakeFirst();
  return row?.last ?? null;
}

export const addSessionExercise = defineCommand(
  async (
    w,
    args: { sessionId: string; exerciseId: string; slotId?: string | null },
  ): Promise<string> => {
    return w.insert("session_exercise", {
      session_id: args.sessionId,
      slot_id: args.slotId ?? null,
      exercise_id: args.exerciseId,
      position: await appendPosition(
        w,
        "session_exercise",
        "session_id",
        args.sessionId,
      ),
      notes: "",
    });
  },
);

/**
 * Swaps the exercise of a session exercise. Logged sets stay with the
 * exercise they were performed on: if there are any, the substitute is added
 * right after it, filling the same slot. Returns the session exercise to log
 * the substitute into.
 */
export const substituteExercise = defineCommand(
  async (
    w,
    args: { sessionExerciseId: string; exerciseId: string },
  ): Promise<string> => {
    const current = await w.db
      .selectFrom("session_exercise")
      .select(["id", "session_id", "slot_id", "exercise_id", "position"])
      .where("id", "=", args.sessionExerciseId)
      .executeTakeFirstOrThrow();
    if (current.exercise_id === args.exerciseId) return current.id;
    const logged = await w.db
      .selectFrom("set_log")
      .select("id")
      .where("session_exercise_id", "=", current.id)
      .where("deleted", "=", 0)
      .limit(1)
      .executeTakeFirst();
    if (!logged) {
      await w.update("session_exercise", current.id, {
        exercise_id: args.exerciseId,
      });
      return current.id;
    }
    const siblings = await liveSiblings(
      w,
      "session_exercise",
      "session_id",
      current.session_id,
    );
    const next = siblings[siblings.findIndex((s) => s.id === current.id) + 1];
    const position =
      next && next.position > current.position
        ? positionBetween(current.position, next.position)
        : positionBetween(current.position, null);
    return w.insert("session_exercise", {
      session_id: current.session_id,
      slot_id: current.slot_id,
      exercise_id: args.exerciseId,
      position,
      notes: "",
    });
  },
);

export const removeSessionExercise = defineCommand(
  async (w, args: { sessionExerciseId: string }): Promise<void> => {
    await w.delete("session_exercise", args.sessionExerciseId);
  },
);

export const moveSessionExercise = defineCommand(
  async (
    w,
    args: { sessionExerciseId: string; toIndex: number },
  ): Promise<void> => {
    const row = await w.db
      .selectFrom("session_exercise")
      .select("session_id")
      .where("id", "=", args.sessionExerciseId)
      .executeTakeFirstOrThrow();
    const siblings = await liveSiblings(
      w,
      "session_exercise",
      "session_id",
      row.session_id,
    );
    await moveInList(
      w,
      "session_exercise",
      siblings,
      args.sessionExerciseId,
      args.toIndex,
    );
  },
);

export const logSet = defineCommand(
  async (
    w,
    args: { sessionExerciseId: string; values: SetValues },
    ctx,
  ): Promise<string> => {
    return w.insert("set_log", {
      session_exercise_id: args.sessionExerciseId,
      position: await appendPosition(
        w,
        "set_log",
        "session_exercise_id",
        args.sessionExerciseId,
      ),
      logged_at: ctx.now,
      ...pickValues(args.values),
    });
  },
);

export const updateSet = defineCommand(
  async (w, args: { setId: string; values: SetValues }): Promise<void> => {
    await w.update("set_log", args.setId, pickValues(args.values));
  },
);

export const deleteSet = defineCommand(
  async (w, args: { setId: string }): Promise<void> => {
    await w.delete("set_log", args.setId);
  },
);

function pickValues(values: SetValues): SetValues {
  return {
    weight_kg: values.weight_kg,
    reps: values.reps,
    duration_s: values.duration_s,
    distance_m: values.distance_m,
  };
}
