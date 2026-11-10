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
