import { runCommand, runQuery, type Store } from "@workout-logger/core";
import { openTestStore } from "@workout-logger/core/testing";
import { describe, expect, it } from "vitest";
import { EXERCISES, METRICS } from "./catalog.ts";
import { MUSCLE_GROUPS, MUSCLES } from "./muscles.ts";
import { ROUTINES, routineContent } from "./routines.ts";
import { catalogRows, exerciseId, muscleId, seedCatalog } from "./seed.ts";

describe("catalog", () => {
  it("has unique snake_case keys and unique names", () => {
    const keys = EXERCISES.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
    const names = EXERCISES.map((e) => e.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every exercise a primary muscle", () => {
    for (const exercise of EXERCISES) {
      expect(Object.values(exercise.muscles), exercise.key).toContain(1);
    }
  });

  it("puts every muscle in a known group", () => {
    for (const muscle of Object.values(MUSCLES)) {
      expect(MUSCLE_GROUPS).toContain(muscle.group);
    }
  });

  it("keeps ids stable: they are permanent", () => {
    expect(exerciseId("barbell_bench_press")).toBe(
      "2ee9c4e0-9a22-5582-954c-4692297a6520",
    );
    expect(muscleId("lats")).toBe(muscleId("lats"));
    expect(muscleId("lats")).not.toBe(exerciseId("lats"));
  });
});

describe("built-in routines", () => {
  it("use built-in exercises, each once per slot", () => {
    const keys = new Set(EXERCISES.map((e) => e.key));
    for (const routine of ROUTINES) {
      for (const day of routine.days) {
        for (const slot of day.slots) {
          for (const key of slot) expect(keys, routine.key).toContain(key);
          expect(new Set(slot).size, slot[0]).toBe(slot.length);
        }
      }
    }
  });

  it("can be added as routines", async () => {
    const store = await openTestStore();
    await seedCatalog(store);
    for (const routine of ROUTINES) {
      const { result: routineId } = await runCommand(
        store,
        "createRoutineWithDays",
        routineContent(routine),
      );
      const detail = await runQuery(store, "routineDetail", { routineId });
      expect(detail?.name).toBe(routine.name);
      expect(detail?.days.map((d) => d.slots.length)).toEqual(
        routine.days.map((d) => d.slots.length),
      );
      expect(
        detail?.days.flatMap((d) => d.slots.map((s) => s.exerciseName)),
      ).not.toContain(null);
    }
  });
});

async function dump(store: Store) {
  const tables = ["muscle", "exercise", "exercise_muscle", "metric"] as const;
  return Promise.all(
    tables.map((t) =>
      store.db.selectFrom(t).selectAll().orderBy("id").execute(),
    ),
  );
}

describe("seedCatalog", () => {
  it("writes the catalog once and identically on every device", async () => {
    const a = await openTestStore();
    const b = await openTestStore();
    const rows = catalogRows();
    expect(await seedCatalog(a)).toEqual({ written: rows.length, skipped: 0 });
    expect(await seedCatalog(a)).toEqual({ written: 0, skipped: rows.length });
    await seedCatalog(b);
    expect(await dump(a)).toEqual(await dump(b));

    const counts = await dump(a);
    expect(counts.map((t) => t.length)).toEqual([
      Object.keys(MUSCLES).length,
      EXERCISES.length,
      EXERCISES.reduce((n, e) => n + Object.keys(e.muscles).length, 0),
      METRICS.length,
    ]);
  });

  it("never overwrites the user's edits or deletes of built-ins", async () => {
    const store = await openTestStore();
    await seedCatalog(store);
    const bench = exerciseId("barbell_bench_press");
    await store.write((w) =>
      w.update("exercise", bench, { name: "Bench", default_rest_s: 180 }),
    );
    const target = await store.db
      .selectFrom("exercise_muscle")
      .select("id")
      .where("exercise_id", "=", bench)
      .where("muscle_id", "=", muscleId("triceps"))
      .executeTakeFirstOrThrow();
    await store.write((w) => w.delete("exercise_muscle", target.id));

    await seedCatalog(store);
    expect(
      await store.db
        .selectFrom("exercise")
        .select(["name", "default_rest_s"])
        .where("id", "=", bench)
        .executeTakeFirst(),
    ).toEqual({
      name: "Bench",
      default_rest_s: 180,
    });
    expect(
      await store.db
        .selectFrom("exercise_muscle")
        .select("deleted")
        .where("id", "=", target.id)
        .executeTakeFirst(),
    ).toEqual({
      deleted: 1,
    });
  });
});
