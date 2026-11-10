import { positionBetween } from "../domain/position.ts";
import type { Writer } from "../store/write.ts";
import { defineCommand } from "./define.ts";
import { appendPosition, liveSiblings, moveInList } from "./order.ts";

export const createRoutine = defineCommand(
  async (w, args: { name: string }): Promise<string> =>
    w.insert("routine", {
      name: args.name,
      position: await appendPosition(w, "routine", null, null),
      archived: 0,
    }),
);

export const updateRoutine = defineCommand(
  async (
    w,
    args: { routineId: string; name?: string; archived?: boolean },
  ): Promise<void> => {
    await w.update("routine", args.routineId, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.archived !== undefined && { archived: args.archived ? 1 : 0 }),
    });
  },
);

/** A copy named "<name> (copy)" at the end of the list, with all live days. */
export const duplicateRoutine = defineCommand(
  async (w, args: { routineId: string }): Promise<string> => {
    const routine = await w.db
      .selectFrom("routine")
      .select(["name"])
      .where("id", "=", args.routineId)
      .executeTakeFirstOrThrow();
    const routineId = await w.insert("routine", {
      name: `${routine.name} (copy)`,
      position: await appendPosition(w, "routine", null, null),
      archived: 0,
    });
    const days = await w.db
      .selectFrom("routine_day")
      .select(["id", "name", "position"])
      .where("routine_id", "=", args.routineId)
      .where("deleted", "=", 0)
      .execute();
    for (const day of days) {
      await copyDay(w, day.id, {
        routine_id: routineId,
        name: day.name,
        position: day.position,
      });
    }
    return routineId;
  },
);

/** A copy named "<name> (copy)" right after the day. */
export const duplicateDay = defineCommand(
  async (w, args: { dayId: string }): Promise<string> => {
    const day = await w.db
      .selectFrom("routine_day")
      .select(["routine_id", "name", "position"])
      .where("id", "=", args.dayId)
      .executeTakeFirstOrThrow();
    const siblings = await liveSiblings(
      w,
      "routine_day",
      "routine_id",
      day.routine_id,
    );
    const next = siblings.find((s) => s.position > day.position);
    return copyDay(w, args.dayId, {
      routine_id: day.routine_id,
      name: `${day.name} (copy)`,
      position: positionBetween(day.position, next?.position ?? null),
    });
  },
);

/** Copies a day's live slots and their live alternatives into a new day. */
async function copyDay(
  w: Writer,
  dayId: string,
  day: { routine_id: string; name: string; position: string },
): Promise<string> {
  const newDayId = await w.insert("routine_day", day);
  const slots = await w.db
    .selectFrom("slot")
    .select(["id", "exercise_id", "position", "rest_s", "note"])
    .where("day_id", "=", dayId)
    .where("deleted", "=", 0)
    .execute();
  for (const { id, ...slot } of slots) {
    const slotId = await w.insert("slot", { ...slot, day_id: newDayId });
    const alternatives = await w.db
      .selectFrom("slot_alternative")
      .select(["exercise_id", "position"])
      .where("slot_id", "=", id)
      .where("deleted", "=", 0)
      .execute();
    for (const alternative of alternatives) {
      await w.insert("slot_alternative", { ...alternative, slot_id: slotId });
    }
  }
  return newDayId;
}

export const deleteRoutine = defineCommand(
  async (w, args: { routineId: string }): Promise<void> => {
    await w.delete("routine", args.routineId);
  },
);

export const moveRoutine = defineCommand(
  async (w, args: { routineId: string; toIndex: number }): Promise<void> => {
    const siblings = await liveSiblings(w, "routine", null, null);
    await moveInList(w, "routine", siblings, args.routineId, args.toIndex);
  },
);

export const addDay = defineCommand(
  async (w, args: { routineId: string; name: string }): Promise<string> =>
    w.insert("routine_day", {
      routine_id: args.routineId,
      name: args.name,
      position: await appendPosition(
        w,
        "routine_day",
        "routine_id",
        args.routineId,
      ),
    }),
);

export const renameDay = defineCommand(
  async (w, args: { dayId: string; name: string }): Promise<void> => {
    await w.update("routine_day", args.dayId, { name: args.name });
  },
);

export const deleteDay = defineCommand(
  async (w, args: { dayId: string }): Promise<void> => {
    await w.delete("routine_day", args.dayId);
  },
);

export const moveDay = defineCommand(
  async (w, args: { dayId: string; toIndex: number }): Promise<void> => {
    const day = await w.db
      .selectFrom("routine_day")
      .select("routine_id")
      .where("id", "=", args.dayId)
      .executeTakeFirstOrThrow();
    const siblings = await liveSiblings(
      w,
      "routine_day",
      "routine_id",
      day.routine_id,
    );
    await moveInList(w, "routine_day", siblings, args.dayId, args.toIndex);
  },
);

export const addSlot = defineCommand(
  async (w, args: { dayId: string; exerciseId: string }): Promise<string> =>
    w.insert("slot", {
      day_id: args.dayId,
      exercise_id: args.exerciseId,
      position: await appendPosition(w, "slot", "day_id", args.dayId),
    }),
);

export const setSlotExercise = defineCommand(
  async (w, args: { slotId: string; exerciseId: string }): Promise<void> => {
    await w.update("slot", args.slotId, { exercise_id: args.exerciseId });
  },
);

/**
 * The slot's rest override and note. Null clears one; an omitted field is
 * left alone. An empty note is stored as null.
 */
export const updateSlot = defineCommand(
  async (
    w,
    args: { slotId: string; restS?: number | null; note?: string | null },
  ): Promise<void> => {
    const note = args.note?.trim();
    await w.update("slot", args.slotId, {
      ...(args.restS !== undefined && { rest_s: args.restS }),
      ...(args.note !== undefined && { note: note ? note : null }),
    });
  },
);

export const deleteSlot = defineCommand(
  async (w, args: { slotId: string }): Promise<void> => {
    await w.delete("slot", args.slotId);
  },
);

export const moveSlot = defineCommand(
  async (w, args: { slotId: string; toIndex: number }): Promise<void> => {
    const slot = await w.db
      .selectFrom("slot")
      .select("day_id")
      .where("id", "=", args.slotId)
      .executeTakeFirstOrThrow();
    const siblings = await liveSiblings(w, "slot", "day_id", slot.day_id);
    await moveInList(w, "slot", siblings, args.slotId, args.toIndex);
  },
);

export const addAlternative = defineCommand(
  async (w, args: { slotId: string; exerciseId: string }): Promise<string> =>
    w.insert("slot_alternative", {
      slot_id: args.slotId,
      exercise_id: args.exerciseId,
      position: await appendPosition(
        w,
        "slot_alternative",
        "slot_id",
        args.slotId,
      ),
    }),
);

export const deleteAlternative = defineCommand(
  async (w, args: { alternativeId: string }): Promise<void> => {
    await w.delete("slot_alternative", args.alternativeId);
  },
);
