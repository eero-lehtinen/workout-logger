import type { SetValues } from "@workout-logger/core";
import { exerciseId } from "@workout-logger/exercises";
import type { MemoryDb } from "../db/memory.ts";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** Ids a story needs to build its URL. */
export interface FixtureIds {
  routineId?: string | undefined;
  sessionId?: string | undefined;
  /** Session exercise of the running session's bench press. */
  benchId?: string | undefined;
  /** Session exercise of a timed exercise in a running session. */
  plankId?: string | undefined;
  idleSessionId?: string | undefined;
  idleSquatId?: string | undefined;
  /** The latest ended session, a few days ago. */
  pastSessionId?: string | undefined;
}

export type Fixture = (db: MemoryDb) => Promise<FixtureIds>;

type Logged = Record<string, (SetValues | [number, number])[]>;

const toSet = (s: SetValues | [number, number]): SetValues =>
  Array.isArray(s)
    ? { weight_kg: s[0], reps: s[1], duration_s: null, distance_m: null }
    : s;

const seconds = (duration_s: number): SetValues => ({
  weight_kg: null,
  reps: null,
  duration_s,
  distance_m: null,
});

async function createRoutine(db: MemoryDb) {
  const run = async <T>(p: Promise<{ result: T }>) => (await p).result;
  const routineId = await run(db.run("createRoutine", { name: "Upper/Lower" }));
  const upper = await run(db.run("addDay", { routineId, name: "Upper" }));
  const lower = await run(db.run("addDay", { routineId, name: "Lower" }));
  const slot = async (
    dayId: string,
    key: string,
    alternatives: string[] = [],
  ) => {
    const slotId = await run(
      db.run("addSlot", { dayId, exerciseId: exerciseId(key) }),
    );
    for (const alt of alternatives) {
      await db.run("addAlternative", { slotId, exerciseId: exerciseId(alt) });
    }
  };
  await slot(upper, "barbell_bench_press", ["dumbbell_bench_press"]);
  await slot(upper, "barbell_row", ["dumbbell_row", "seated_cable_row"]);
  await slot(upper, "overhead_press");
  await slot(lower, "back_squat", ["leg_press"]);
  await slot(lower, "romanian_deadlift");
  await slot(lower, "lying_leg_curl");
  return { routineId, upper, lower };
}

/**
 * A session at `startedAt` with the given sets, 3 minutes apart. Exercises
 * missing from the day are added. Ends manually unless `running`.
 */
async function session(
  db: MemoryDb,
  options: {
    routineId: string | null;
    dayId: string | null;
    startedAt: number;
    sets: Logged;
    end?: boolean;
  },
) {
  const { result: sessionId } = await db.run(
    "startSession",
    { routineId: options.routineId, dayId: options.dayId },
    options.startedAt,
  );
  const view = await db.client.query("sessionView", { sessionId });
  const ids: Record<string, string> = {};
  let t = options.startedAt;
  for (const [key, sets] of Object.entries(options.sets)) {
    let id = view?.exercises.find((e) => e.exerciseId === exerciseId(key))?.id;
    if (!id) {
      id = (
        await db.run(
          "addSessionExercise",
          { sessionId, exerciseId: exerciseId(key) },
          t,
        )
      ).result;
    }
    ids[key] = id;
    for (const set of sets) {
      t += 3 * MIN;
      await db.run("logSet", { sessionExerciseId: id, values: toSet(set) }, t);
    }
  }
  if (options.end !== false)
    await db.run("endSession", { sessionId }, t + 5 * MIN);
  return { sessionId, ids, lastSetAt: t };
}

export const empty: Fixture = async () => ({});

export const withRoutine: Fixture = async (db) => {
  const { routineId } = await createRoutine(db);
  return { routineId };
};

/** Three weeks of Upper/Lower, ended. Lower was last, so Upper is next. */
export const withHistory: Fixture = async (db) => {
  const { routineId, upper, lower } = await createRoutine(db);
  const now = Date.now();
  const upperDay = (
    daysAgo: number,
    bench: [number, number][],
    row: [number, number][],
  ) =>
    session(db, {
      routineId,
      dayId: upper,
      startedAt: now - daysAgo * DAY,
      sets: {
        barbell_bench_press: bench,
        barbell_row: row,
        overhead_press: [
          [50, 8],
          [50, 7],
          [50, 6],
        ],
      },
    });
  const lowerDay = (daysAgo: number, squat: [number, number][]) =>
    session(db, {
      routineId,
      dayId: lower,
      startedAt: now - daysAgo * DAY,
      sets: {
        back_squat: squat,
        romanian_deadlift: [
          [100, 10],
          [100, 9],
        ],
        lying_leg_curl: [
          [40, 12],
          [40, 11],
        ],
      },
    });
  await upperDay(
    16,
    [
      [95, 8],
      [95, 7],
      [95, 7],
    ],
    [
      [75, 10],
      [75, 9],
    ],
  );
  await lowerDay(14, [
    [120, 6],
    [120, 6],
    [120, 5],
  ]);
  await upperDay(
    11,
    [
      [97.5, 8],
      [97.5, 7],
      [97.5, 6],
    ],
    [
      [77.5, 10],
      [77.5, 9],
    ],
  );
  await lowerDay(9, [
    [122.5, 6],
    [122.5, 6],
    [122.5, 5],
  ]);
  await upperDay(
    5,
    [
      [100, 8],
      [100, 8],
      [100, 6],
    ],
    [
      [77.5, 10],
      [80, 9],
    ],
  );
  const last = await lowerDay(3, [
    [125, 6],
    [125, 5],
    [125, 5],
  ]);
  return { routineId, pastSessionId: last.sessionId };
};

/**
 * History plus an Upper session in progress: bench has a PR and a weight
 * increase logged and a third set to go, rows have set records.
 */
export const running: Fixture = async (db) => {
  const ids = await withHistory(db);
  const { routineId } = ids;
  const options = await db.client.query("startOptions", undefined);
  const upper = options.routines[0]?.days[0]?.id ?? null;
  const current = await session(db, {
    routineId: routineId ?? null,
    dayId: upper,
    startedAt: Date.now() - 16 * MIN,
    sets: {
      barbell_bench_press: [
        [102.5, 8],
        [102.5, 7],
      ],
      barbell_row: [
        [80, 10],
        [80, 10],
      ],
    },
    end: false,
  });
  return {
    ...ids,
    sessionId: current.sessionId,
    benchId: current.ids.barbell_bench_press,
  };
};

/** A session left open whose last set is 40 minutes old: it has idled out. */
export const idleEnded: Fixture = async (db) => {
  const ids = await withHistory(db);
  const idle = await session(db, {
    routineId: null,
    dayId: null,
    startedAt: Date.now() - 52 * MIN,
    sets: {
      back_squat: [
        [125, 6],
        [125, 6],
      ],
    },
    end: false,
  });
  return {
    ...ids,
    idleSessionId: idle.sessionId,
    idleSquatId: idle.ids.back_squat,
  };
};

/** A timed exercise: side planks last week and one set today. */
export const timed: Fixture = async (db) => {
  const now = Date.now();
  await session(db, {
    routineId: null,
    dayId: null,
    startedAt: now - 7 * DAY,
    sets: { side_plank: [seconds(40), seconds(45)] },
  });
  const today = await session(db, {
    routineId: null,
    dayId: null,
    startedAt: now - 6 * MIN,
    sets: { side_plank: [seconds(50)] },
    end: false,
  });
  return { sessionId: today.sessionId, plankId: today.ids.side_plank };
};

export const inPounds: Fixture = async (db) => {
  const ids = await running(db);
  await db.run("setSetting", { key: "weight_unit", value: "lb" });
  return ids;
};

export const timersOff: Fixture = async (db) => {
  const ids = await running(db);
  await db.run("setSetting", { key: "rest_timer_enabled", value: false });
  await db.run("setSetting", { key: "session_timer_shown", value: false });
  return ids;
};

/** Two custom exercises the user has archived. */
export const withArchived: Fixture = async (db) => {
  const muscles = await db.client.query("muscles", undefined);
  const chest = muscles.find((m) => m.name === "Chest")?.id ?? "";
  for (const name of ["Cable Fly (Old Gym)", "Pec Deck (Old Gym)"]) {
    const { result: exerciseId } = await db.run("createExercise", {
      name,
      type: "weight_reps",
      defaultRestS: null,
      weightIncrementKg: null,
      notes: "",
      muscles: { [chest]: 1 },
    });
    await db.run("updateExercise", { exerciseId, archived: true });
  }
  return {};
};
