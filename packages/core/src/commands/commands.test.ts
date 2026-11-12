import { describe, expect, it } from "vitest";
import { runCommand, runQuery } from "../api.ts";
import type { SetValues } from "../domain/markers.ts";
import { openTestStore } from "../testing.ts";
import type { CommandArgs, CommandName } from "./index.ts";

const T0 = Date.UTC(2026, 0, 5, 17);
const MIN = 60_000;

async function setup() {
  let now = T0;
  const store = await openTestStore({ now: () => now });
  const run = async <N extends CommandName>(name: N, args: CommandArgs<N>) =>
    (await runCommand(store, name, args, { now, tz: "Europe/Helsinki" }))
      .result;
  const advance = (ms: number) => {
    now += ms;
  };
  const muscle = (id: string, name: string, group: string) =>
    store.db
      .insertInto("muscle")
      .values({
        id,
        hlc: "000000000000000-00000-seed",
        deleted: 0,
        name,
        group_name: group,
      })
      .execute();
  await muscle("chest", "Chest", "Chest");
  await muscle("triceps", "Triceps", "Arms");
  await muscle("quads", "Quads", "Legs");

  const exercise = (name: string, muscles: Record<string, number>) =>
    run("createExercise", {
      name,
      type: "weight_reps",
      defaultRestS: null,
      weightIncrementKg: null,
      notes: "",
      muscles,
    });
  const bench = await exercise("Barbell Bench Press", {
    chest: 1,
    triceps: 0.5,
  });
  const dbBench = await exercise("Dumbbell Bench Press", { chest: 1 });
  const dips = await exercise("Dip", { chest: 1, triceps: 1 });
  const squat = await exercise("Back Squat", { quads: 1 });

  const routineId = await run("createRoutine", { name: "Upper/Lower" });
  const upper = await run("addDay", { routineId, name: "Upper" });
  const lower = await run("addDay", { routineId, name: "Lower" });
  const benchSlot = await run("addSlot", { dayId: upper, exerciseId: bench });
  await run("addAlternative", { slotId: benchSlot, exerciseId: dbBench });
  await run("addSlot", { dayId: lower, exerciseId: squat });

  return {
    store,
    run,
    advance,
    query: <N extends Parameters<typeof runQuery>[1]>(
      name: N,
      args: Parameters<typeof runQuery<N>>[2],
    ) => runQuery(store, name, args),
    ids: { bench, dbBench, dips, squat, routineId, upper, lower, benchSlot },
  };
}

const set = (weight_kg: number, reps: number): SetValues => ({
  weight_kg,
  reps,
  duration_s: null,
  distance_m: null,
});

describe("starting sessions", () => {
  it("preselects the latest routine and highlights the next day", async () => {
    const { run, query, advance, ids } = await setup();
    let options = await query("startOptions", undefined);
    expect(options.preselectedRoutineId).toBe(ids.routineId);
    expect(options.routines[0]).toMatchObject({
      days: [{ name: "Upper" }, { name: "Lower" }],
      lastDayId: null,
      nextDayId: ids.upper,
    });

    await run("startSession", { routineId: ids.routineId, dayId: ids.upper });
    advance(60 * MIN);
    options = await query("startOptions", undefined);
    expect(options.routines[0]).toMatchObject({
      lastDayId: ids.upper,
      nextDayId: ids.lower,
    });

    // Ad hoc sessions don't change the preselection.
    const other = await run("createRoutine", { name: "Full body" });
    await run("startSession", { routineId: null, dayId: null });
    options = await query("startOptions", undefined);
    expect(options.preselectedRoutineId).toBe(ids.routineId);
    expect(options.routines.map((r) => r.id)).toEqual([ids.routineId, other]);
  });

  it("lists each day's exercises in slot order", async () => {
    const { run, query, ids } = await setup();
    await run("addSlot", { dayId: ids.upper, exerciseId: ids.dips });
    const gone = await run("addSlot", {
      dayId: ids.upper,
      exerciseId: ids.squat,
    });
    await run("deleteSlot", { slotId: gone });
    const [routine] = (await query("startOptions", undefined)).routines;
    expect(routine?.days).toEqual([
      {
        id: ids.upper,
        name: "Upper",
        exercises: ["Barbell Bench Press", "Dip"],
      },
      { id: ids.lower, name: "Lower", exercises: ["Back Squat"] },
    ]);
  });

  it("fills a day's slots as session exercises", async () => {
    const { run, query, ids } = await setup();
    const sessionId = await run("startSession", {
      routineId: ids.routineId,
      dayId: ids.upper,
    });
    const view = await query("sessionView", { sessionId });
    expect(view?.session).toMatchObject({
      routineName: "Upper/Lower",
      dayName: "Upper",
      startedAt: T0,
      tz: "Europe/Helsinki",
      exerciseCount: 1,
      setCount: 0,
      lastSetAt: null,
    });
    expect(view?.exercises).toMatchObject([
      { exerciseId: ids.bench, slotId: ids.benchSlot, sets: [] },
    ]);
  });
});

describe("logging", () => {
  async function logged() {
    const ctx = await setup();
    const { run, advance, ids } = ctx;
    const first = await run("startSession", {
      routineId: ids.routineId,
      dayId: ids.upper,
    });
    const firstView = await ctx.query("sessionView", { sessionId: first });
    const se1 = firstView?.exercises[0]?.id ?? "";
    for (const values of [set(100, 8), set(100, 7), set(100, 6)]) {
      advance(3 * MIN);
      await run("logSet", { sessionExerciseId: se1, values });
    }
    advance(3 * 24 * 60 * MIN);
    const second = await run("startSession", {
      routineId: ids.routineId,
      dayId: ids.upper,
    });
    const secondView = await ctx.query("sessionView", { sessionId: second });
    const se2 = secondView?.exercises[0]?.id ?? "";
    return { ...ctx, first, second, se1, se2 };
  }

  it("shows the previous performance and prefills from it", async () => {
    const { query, run, advance, se2 } = await logged();
    let log = await query("exerciseLog", { sessionExerciseId: se2 });
    expect(log?.previous).toHaveLength(1);
    expect(log?.previous[0]?.sets.map((s) => [s.weight_kg, s.reps])).toEqual([
      [100, 8],
      [100, 7],
      [100, 6],
    ]);
    expect(log?.prefill).toEqual(set(100, 8));
    expect(log?.restSeconds).toBe(120);

    advance(MIN);
    await run("logSet", { sessionExerciseId: se2, values: set(102.5, 8) });
    log = await query("exerciseLog", { sessionExerciseId: se2 });
    // Weight of this session's set 1, reps of the previous set 2.
    expect(log?.prefill).toEqual(set(102.5, 7));
    expect(log?.sets).toMatchObject([
      {
        weight_kg: 102.5,
        reps: 8,
        marker: "pr",
        markerBasis: {
          measure: "e1rm",
          against: {
            weight_kg: 100,
            reps: 8,
            setNumber: 1,
            startedAt: T0,
            sameSession: false,
          },
        },
      },
    ]);
  });

  it("marks set records and weight increases against the reference set", async () => {
    const { query, run, se2 } = await logged();
    await run("logSet", { sessionExerciseId: se2, values: set(100, 8) });
    await run("logSet", { sessionExerciseId: se2, values: set(100, 8) });
    await run("logSet", { sessionExerciseId: se2, values: set(105, 4) });
    const log = await query("exerciseLog", { sessionExerciseId: se2 });
    expect(log?.sets.map((s) => s.marker)).toEqual([
      null,
      "set_record",
      "weight_increase",
    ]);
  });

  it("gives the session view the same markers as the logging view", async () => {
    const { query, run, first, second, se2 } = await logged();
    await run("logSet", { sessionExerciseId: se2, values: set(102.5, 8) });
    await run("logSet", { sessionExerciseId: se2, values: set(100, 8) });
    const markers = async (sessionId: string) =>
      (await query("sessionView", { sessionId }))?.exercises[0]?.sets.map(
        (s) => s.marker,
      );
    // The first session has nothing earlier to beat.
    expect(await markers(first)).toEqual([null, null, null]);
    expect(await markers(second)).toEqual(["pr", "set_record"]);
  });

  it("edits and deletes sets", async () => {
    const { query, run, se2 } = await logged();
    const a = await run("logSet", {
      sessionExerciseId: se2,
      values: set(100, 8),
    });
    const b = await run("logSet", {
      sessionExerciseId: se2,
      values: set(100, 7),
    });
    await run("updateSet", { setId: a, values: set(97.5, 8) });
    await run("deleteSet", { setId: b });
    const log = await query("exerciseLog", { sessionExerciseId: se2 });
    expect(log?.sets.map((s) => [s.weight_kg, s.reps])).toEqual([[97.5, 8]]);
  });

  it("hides sets of deleted sessions from previous performances", async () => {
    const { query, run, first, se2 } = await logged();
    await run("deleteSession", { sessionId: first });
    const log = await query("exerciseLog", { sessionExerciseId: se2 });
    expect(log?.previous).toEqual([]);
    expect(log?.prefill).toEqual({
      weight_kg: null,
      reps: null,
      duration_s: null,
      distance_m: null,
    });
  });

  it("lists recent sessions with counts", async () => {
    const { query, first, second } = await logged();
    const recent = await query("recentSessions", { limit: 10 });
    expect(recent.map((s) => [s.id, s.exerciseCount, s.setCount])).toEqual([
      [second, 1, 0],
      [first, 1, 3],
    ]);
  });
});

describe("session exercises", () => {
  it("keeps notes on the session and on each of its exercises", async () => {
    const { query, run, ids } = await setup();
    const sessionId = await run("startSession", {
      routineId: null,
      dayId: null,
    });
    const se = await run("addSessionExercise", {
      sessionId,
      exerciseId: ids.squat,
    });
    await run("updateSessionNotes", { sessionId, notes: "Slept badly" });
    await run("updateSessionExerciseNotes", {
      sessionExerciseId: se,
      notes: "Set 2: knee",
    });
    const view = await query("sessionView", { sessionId });
    expect(view?.session.notes).toBe("Slept badly");
    expect(view?.exercises.map((e) => e.notes)).toEqual(["Set 2: knee"]);
    expect((await query("exerciseLog", { sessionExerciseId: se }))?.notes).toBe(
      "Set 2: knee",
    );
  });

  it("substitutes in place before any set, and alongside after", async () => {
    const { query, run, ids } = await setup();
    const sessionId = await run("startSession", {
      routineId: ids.routineId,
      dayId: ids.upper,
    });
    const se =
      (await query("sessionView", { sessionId }))?.exercises[0]?.id ?? "";
    const options = await query("substitutionOptions", {
      exerciseId: ids.bench,
      slotId: ids.benchSlot,
    });
    expect(options.alternativeIds).toEqual([ids.dbBench]);

    expect(
      await run("substituteExercise", {
        sessionExerciseId: se,
        exerciseId: ids.dbBench,
      }),
    ).toBe(se);
    await run("logSet", { sessionExerciseId: se, values: set(40, 10) });
    const added = await run("substituteExercise", {
      sessionExerciseId: se,
      exerciseId: ids.dips,
    });
    await run("addSessionExercise", { sessionId, exerciseId: ids.squat });
    const view = await query("sessionView", { sessionId });
    expect(
      view?.exercises.map((e) => [e.id === added, e.name, e.substitutesName]),
    ).toEqual([
      [false, "Dumbbell Bench Press", "Barbell Bench Press"],
      [true, "Dip", "Barbell Bench Press"],
      [false, "Back Squat", null],
    ]);
    const logs = await Promise.all(
      (view?.exercises ?? []).map((e) =>
        query("exerciseLog", { sessionExerciseId: e.id }),
      ),
    );
    expect(logs.map((l) => l?.substitutesName)).toEqual([
      "Barbell Bench Press",
      "Barbell Bench Press",
      null,
    ]);
  });

  it("reorders and removes", async () => {
    const { query, run, ids } = await setup();
    const sessionId = await run("startSession", {
      routineId: null,
      dayId: null,
    });
    for (const exerciseId of [ids.bench, ids.dips, ids.squat]) {
      await run("addSessionExercise", { sessionId, exerciseId });
    }
    const names = async () =>
      (await query("sessionView", { sessionId }))?.exercises.map((e) => e.name);
    const view = await query("sessionView", { sessionId });
    const [bench, dip, squat] = view?.exercises ?? [];
    // A drop moves straight to its index; out-of-range indexes clamp.
    await run("moveSessionExercise", {
      sessionExerciseId: squat?.id ?? "",
      toIndex: 0,
    });
    expect(await names()).toEqual(["Back Squat", "Barbell Bench Press", "Dip"]);
    await run("moveSessionExercise", {
      sessionExerciseId: bench?.id ?? "",
      toIndex: 9,
    });
    expect(await names()).toEqual(["Back Squat", "Dip", "Barbell Bench Press"]);
    await run("moveSessionExercise", {
      sessionExerciseId: bench?.id ?? "",
      toIndex: 1,
    });
    expect(await names()).toEqual(["Back Squat", "Barbell Bench Press", "Dip"]);
    await run("removeSessionExercise", { sessionExerciseId: dip?.id ?? "" });
    expect(await names()).toEqual(["Back Squat", "Barbell Bench Press"]);
  });

  it("renumbers when concurrent inserts left equal positions", async () => {
    const { store, query, run, ids } = await setup();
    const sessionId = await run("startSession", {
      routineId: null,
      dayId: null,
    });
    const added: string[] = [];
    for (const exerciseId of [ids.bench, ids.dips, ids.squat]) {
      added.push(await run("addSessionExercise", { sessionId, exerciseId }));
    }
    // Two devices appending at once can pick the same key.
    await store.write(async (w) => {
      for (const id of added) {
        await w.update("session_exercise", id, { position: "a0" });
      }
    });
    const before = (await query("sessionView", { sessionId }))?.exercises ?? [];
    const last = before.at(-1);
    await run("moveSessionExercise", {
      sessionExerciseId: last?.id ?? "",
      toIndex: 1,
    });
    const after = (await query("sessionView", { sessionId }))?.exercises ?? [];
    expect(after.map((e) => e.id)).toEqual([
      before[0]?.id,
      last?.id,
      before[1]?.id,
    ]);
  });

  it("ends an idle session at its last set", async () => {
    const { query, run, advance, ids } = await setup();
    const sessionId = await run("startSession", {
      routineId: null,
      dayId: null,
    });
    const se = await run("addSessionExercise", {
      sessionId,
      exerciseId: ids.squat,
    });
    advance(10 * MIN);
    await run("logSet", { sessionExerciseId: se, values: set(140, 5) });
    advance(60 * MIN);
    await run("endSession", { sessionId });
    const view = await query("sessionView", { sessionId });
    expect(view?.session).toMatchObject({
      endedAt: T0 + 10 * MIN,
      endReason: "manual",
    });
    await run("resumeSession", { sessionId });
    expect(
      (await query("sessionView", { sessionId }))?.session.endedAt,
    ).toBeNull();
  });
});

describe("exercise list", () => {
  it("counts logged sets, the latest set, and the best set", async () => {
    const { query, run, advance, ids } = await setup();
    for (const second of [set(105, 3), set(100, 8)]) {
      advance(24 * 60 * MIN);
      const sessionId = await run("startSession", {
        routineId: null,
        dayId: null,
      });
      const bench = await run("addSessionExercise", {
        sessionId,
        exerciseId: ids.bench,
      });
      advance(MIN);
      await run("logSet", { sessionExerciseId: bench, values: set(100, 5) });
      advance(MIN);
      await run("logSet", { sessionExerciseId: bench, values: second });
      // Added but never logged: doesn't count.
      await run("addSessionExercise", { sessionId, exerciseId: ids.squat });
    }
    const list = await query("exercises", undefined);
    const item = (id: string) => list.find((e) => e.id === id);
    expect(item(ids.bench)).toMatchObject({
      loggedSets: 4,
      lastLoggedAt: T0 + 2 * 24 * 60 * MIN + 4 * MIN,
      best: { kind: "e1rm", set: { weight_kg: 100, reps: 8 } },
    });
    expect(item(ids.squat)).toMatchObject({
      loggedSets: 0,
      lastLoggedAt: null,
      best: null,
    });
  });
});

describe("routines and exercises", () => {
  it("reads a routine with days, slots, and alternatives", async () => {
    const { query, run, ids } = await setup();
    await run("moveDay", { dayId: ids.lower, toIndex: 0 });
    const detail = await query("routineDetail", { routineId: ids.routineId });
    expect(detail?.days.map((d) => d.name)).toEqual(["Lower", "Upper"]);
    expect(detail?.days[1]?.slots).toMatchObject([
      {
        exerciseName: "Barbell Bench Press",
        alternatives: [{ exerciseName: "Dumbbell Bench Press" }],
      },
    ]);
  });

  it("keeps a slot's rest override and note, and uses them while logging", async () => {
    const { query, run, ids } = await setup();
    await run("updateSlot", {
      slotId: ids.benchSlot,
      restS: 180,
      note: "  heavy, 6-10 ",
    });
    let detail = await query("routineDetail", { routineId: ids.routineId });
    expect(detail?.days[0]?.slots[0]).toMatchObject({
      restS: 180,
      note: "heavy, 6-10",
    });
    const sessionId = await run("startSession", {
      routineId: ids.routineId,
      dayId: ids.upper,
    });
    const view = await query("sessionView", { sessionId });
    const log = await query("exerciseLog", {
      sessionExerciseId: view?.exercises[0]?.id ?? "",
    });
    expect(log).toMatchObject({ restSeconds: 180, slotNote: "heavy, 6-10" });

    await run("updateSlot", { slotId: ids.benchSlot, note: "" });
    detail = await query("routineDetail", { routineId: ids.routineId });
    expect(detail?.days[0]?.slots[0]).toMatchObject({ restS: 180, note: null });
  });

  it("duplicates routines and days with their slots", async () => {
    const { query, run, ids } = await setup();
    await run("updateSlot", { slotId: ids.benchSlot, note: "heavy" });
    await run("updateRoutine", {
      routineId: ids.routineId,
      description: "  Four days a week. ",
    });
    const copyId = await run("duplicateRoutine", { routineId: ids.routineId });
    const copy = await query("routineDetail", { routineId: copyId });
    expect(copy?.name).toBe("Upper/Lower (copy)");
    expect(copy?.description).toBe("Four days a week.");
    expect(copy?.days.map((d) => d.name)).toEqual(["Upper", "Lower"]);
    expect(copy?.days[0]?.slots).toMatchObject([
      {
        exerciseName: "Barbell Bench Press",
        note: "heavy",
        alternatives: [{ exerciseName: "Dumbbell Bench Press" }],
      },
    ]);
    expect(copy?.days[0]?.slots[0]?.id).not.toBe(ids.benchSlot);

    await run("duplicateDay", { dayId: ids.upper });
    const original = await query("routineDetail", {
      routineId: ids.routineId,
    });
    expect(original?.days.map((d) => d.name)).toEqual([
      "Upper",
      "Upper (copy)",
      "Lower",
    ]);
    const routines = await query("routines", undefined);
    expect(routines.map((r) => r.name)).toEqual([
      "Upper/Lower",
      "Upper/Lower (copy)",
    ]);
  });

  it("creates a routine with its days, slots, and alternatives in one undoable write", async () => {
    const { store, query, ids } = await setup();
    const { result: routineId, undoTx } = await runCommand(
      store,
      "createRoutineWithDays",
      {
        name: "Push/Legs",
        description: "Two days.",
        days: [
          {
            name: "Push",
            slots: [
              {
                exerciseId: ids.bench,
                alternativeIds: [ids.dbBench, ids.dips],
              },
              { exerciseId: ids.dips, alternativeIds: [] },
            ],
          },
          {
            name: "Legs",
            slots: [{ exerciseId: ids.squat, alternativeIds: [] }],
          },
        ],
      },
    );
    const detail = await query("routineDetail", { routineId });
    expect(detail?.description).toBe("Two days.");
    expect(detail?.days.map((d) => d.name)).toEqual(["Push", "Legs"]);
    expect(detail?.days[0]?.slots).toMatchObject([
      {
        exerciseName: "Barbell Bench Press",
        alternatives: [
          { exerciseName: "Dumbbell Bench Press" },
          { exerciseName: "Dip" },
        ],
      },
      { exerciseName: "Dip", alternatives: [] },
    ]);
    expect((await query("routines", undefined)).map((r) => r.name)).toEqual([
      "Upper/Lower",
      "Push/Legs",
    ]);

    expect(await store.undo(undoTx ?? undefined)).toBe(true);
    expect((await query("routines", undefined)).map((r) => r.name)).toEqual([
      "Upper/Lower",
    ]);
  });

  it("requires a primary muscle and rewrites targets", async () => {
    const { query, run, ids } = await setup();
    await expect(
      run("updateExercise", {
        exerciseId: ids.bench,
        muscles: { triceps: 0.5 },
      }),
    ).rejects.toThrow("primary muscle");
    await run("updateExercise", {
      exerciseId: ids.bench,
      name: "Bench",
      muscles: { chest: 1, quads: 0.5 },
    });
    expect(
      await query("exerciseDetail", { exerciseId: ids.bench }),
    ).toMatchObject({
      name: "Bench",
      muscles: { chest: 1, quads: 0.5 },
    });
  });
});

describe("settings", () => {
  it("reads defaults, written values, and ignores invalid ones", async () => {
    const { store, query, run } = await setup();
    expect(await query("settings", undefined)).toMatchObject({
      weight_unit: "kg",
      rest_default_s: 120,
      rest_timer_enabled: true,
    });
    await run("setSetting", { key: "weight_unit", value: "lb" });
    await run("setSetting", { key: "rest_timer_enabled", value: false });
    await store.write((w) =>
      w.put("setting", "rest_default_s", { value_json: '"soon"' }),
    );
    expect(await query("settings", undefined)).toMatchObject({
      weight_unit: "lb",
      rest_default_s: 120,
      rest_timer_enabled: false,
    });
  });
});

describe("undo", () => {
  it("undoes a deleted set by its transaction", async () => {
    const { store, query, run, ids } = await setup();
    const sessionId = await run("startSession", {
      routineId: null,
      dayId: null,
    });
    const se = await run("addSessionExercise", {
      sessionId,
      exerciseId: ids.squat,
    });
    const setId = await run("logSet", {
      sessionExerciseId: se,
      values: set(140, 5),
    });
    const { undoTx } = await runCommand(store, "deleteSet", { setId });
    expect(await store.undo(undoTx ?? undefined)).toBe(true);
    const log = await query("exerciseLog", { sessionExerciseId: se });
    expect(log?.sets.map((s) => s.id)).toEqual([setId]);
  });
});
