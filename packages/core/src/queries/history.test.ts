import { describe, expect, it } from "vitest";
import { runCommand, runQuery } from "../api.ts";
import type { CommandArgs, CommandName } from "../commands/index.ts";
import { openTestStore } from "../testing.ts";

const T0 = Date.UTC(2026, 0, 5, 17);
const DAY = 86_400_000;

async function setup() {
  let now = T0;
  const store = await openTestStore({ now: () => now });
  const run = async <N extends CommandName>(
    name: N,
    args: CommandArgs<N>,
    at = now,
  ) => {
    now = at;
    return (await runCommand(store, name, args, { now, tz: "Europe/Helsinki" }))
      .result;
  };
  for (const [id, group] of [
    ["chest", "Chest"],
    ["triceps", "Arms"],
    ["quads", "Legs"],
  ] as const) {
    await store.db
      .insertInto("muscle")
      .values({
        id,
        hlc: "000000000000000-00000-seed",
        deleted: 0,
        name: id,
        group_name: group,
      })
      .execute();
  }
  const exercise = (name: string, muscles: Record<string, number>) =>
    run("createExercise", {
      name,
      type: "weight_reps",
      defaultRestS: null,
      weightIncrementKg: null,
      notes: "",
      muscles,
    });
  const bench = await exercise("Bench", { chest: 1, triceps: 0.5 });
  const squat = await exercise("Squat", { quads: 1 });
  const routineId = await run("createRoutine", { name: "UL" });
  const upper = await run("addDay", { routineId, name: "Upper" });
  const lower = await run("addDay", { routineId, name: "Lower" });

  const session = async (
    at: number,
    dayId: string | null,
    sets: [string, number, number][],
  ) => {
    const sessionId = await run(
      "startSession",
      { routineId: dayId ? routineId : null, dayId },
      at,
    );
    const ids = new Map<string, string>();
    for (const [exerciseId, weight_kg, reps] of sets) {
      let id = ids.get(exerciseId);
      if (!id) {
        id = await run("addSessionExercise", { sessionId, exerciseId });
        ids.set(exerciseId, id);
      }
      await run("logSet", {
        sessionExerciseId: id,
        values: { weight_kg, reps, duration_s: null, distance_m: null },
      });
    }
    await run("endSession", { sessionId });
    return sessionId;
  };
  return { store, run, bench, squat, routineId, upper, lower, session };
}

describe("history queries", () => {
  it("returns an exercise's performances with markers and records", async () => {
    const { store, bench, session } = await setup();
    await session(T0, null, [[bench, 100, 5]]);
    await session(T0 + 2 * DAY, null, [
      [bench, 105, 5],
      [bench, 80, 15],
    ]);
    const history = await runQuery(store, "exerciseHistory", {
      exerciseId: bench,
    });
    expect(history?.performances.map((p) => p.sets.length)).toEqual([1, 2]);
    expect(history?.performances[1]?.sets[0]?.marker).toBe("pr");
    expect(history?.records.headline[0]).toMatchObject({
      kind: "e1rm",
      value: 105 * (1 + 5 / 30),
    });
    expect(history?.records.byReps.map((r) => r.reps)).toEqual([5, 15]);
  });

  it("lists sessions in a range with their day's index", async () => {
    const { store, bench, squat, upper, lower, session } = await setup();
    await session(T0, upper, [[bench, 100, 5]]);
    await session(T0 + DAY, lower, [[squat, 120, 5]]);
    await session(T0 + 2 * DAY, null, [[squat, 120, 5]]);
    const sessions = await runQuery(store, "sessionsInRange", {
      from: T0 + 1,
      to: T0 + 3 * DAY,
    });
    expect(sessions.map((s) => [s.dayName, s.dayIndex])).toEqual([
      ["Lower", 1],
      [null, null],
    ]);
  });

  it("collects the muscle groups each session trained", async () => {
    const { store, run, bench, squat, upper, session } = await setup();
    const withSets = await session(T0, upper, [
      [bench, 100, 5],
      [squat, 100, 5],
    ]);
    // An exercise without sets doesn't count.
    const empty = await session(T0 + DAY, null, []);
    await run("addSessionExercise", { sessionId: empty, exerciseId: squat });
    const stats = await runQuery(store, "trainingStats", undefined);
    const groups = (id: string) =>
      stats.sessions.find((s) => s.id === id)?.muscleGroups.sort();
    expect(groups(withSets)).toEqual(["Chest", "Legs"]);
    expect(groups(empty)).toEqual([]);
    expect(stats.muscleGroups.sort()).toEqual(["Arms", "Chest", "Legs"]);
    expect(stats.routines[0]?.days.map((d) => [d.name, d.index])).toEqual([
      ["Upper", 0],
      ["Lower", 1],
    ]);
  });
});
