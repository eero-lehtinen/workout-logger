import { compareOrder } from "../domain/position.ts";
import { defineQuery } from "./define.ts";

export interface RoutineItem {
  id: string;
  name: string;
  archived: boolean;
  dayNames: string[];
}

export const routines = defineQuery(
  ["routine", "routine_day"],
  async (db): Promise<RoutineItem[]> => {
    const rows = await db
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
    return rows.sort(compareOrder).map((r) => ({
      id: r.id,
      name: r.name,
      archived: r.archived === 1,
      dayNames: days.filter((d) => d.routine_id === r.id).map((d) => d.name),
    }));
  },
);

export interface RoutineDetail {
  id: string;
  name: string;
  archived: boolean;
  days: {
    id: string;
    name: string;
    slots: {
      id: string;
      exerciseId: string;
      /** Null if the exercise is missing or deleted. */
      exerciseName: string | null;
      alternatives: {
        id: string;
        exerciseId: string;
        exerciseName: string | null;
      }[];
    }[];
  }[];
}

export const routineDetail = defineQuery(
  ["routine", "routine_day", "slot", "slot_alternative", "exercise"],
  async (db, args: { routineId: string }): Promise<RoutineDetail | null> => {
    const routine = await db
      .selectFrom("routine")
      .select(["id", "name", "archived"])
      .where("id", "=", args.routineId)
      .where("deleted", "=", 0)
      .executeTakeFirst();
    if (!routine) return null;
    const days = await db
      .selectFrom("routine_day")
      .select(["id", "name", "position"])
      .where("routine_id", "=", args.routineId)
      .where("deleted", "=", 0)
      .execute();
    const dayIds = days.map((d) => d.id);
    const slots = dayIds.length
      ? await db
          .selectFrom("slot")
          .leftJoin("exercise as e", (join) =>
            join.onRef("e.id", "=", "slot.exercise_id").on("e.deleted", "=", 0),
          )
          .select([
            "slot.id",
            "slot.day_id",
            "slot.position",
            "slot.exercise_id",
            "e.name",
          ])
          .where("slot.day_id", "in", dayIds)
          .where("slot.deleted", "=", 0)
          .execute()
      : [];
    const slotIds = slots.map((s) => s.id);
    const alternatives = slotIds.length
      ? await db
          .selectFrom("slot_alternative as a")
          .leftJoin("exercise as e", (join) =>
            join.onRef("e.id", "=", "a.exercise_id").on("e.deleted", "=", 0),
          )
          .select([
            "a.id",
            "a.slot_id",
            "a.position",
            "a.exercise_id",
            "e.name",
          ])
          .where("a.slot_id", "in", slotIds)
          .where("a.deleted", "=", 0)
          .execute()
      : [];
    slots.sort(compareOrder);
    alternatives.sort(compareOrder);

    return {
      id: routine.id,
      name: routine.name,
      archived: routine.archived === 1,
      days: days.sort(compareOrder).map((d) => ({
        id: d.id,
        name: d.name,
        slots: slots
          .filter((s) => s.day_id === d.id)
          .map((s) => ({
            id: s.id,
            exerciseId: s.exercise_id,
            exerciseName: s.name,
            alternatives: alternatives
              .filter((a) => a.slot_id === s.id)
              .map((a) => ({
                id: a.id,
                exerciseId: a.exercise_id,
                exerciseName: a.name,
              })),
          })),
      })),
    };
  },
);
