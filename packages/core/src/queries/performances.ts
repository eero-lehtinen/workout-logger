import type { Kysely } from "kysely";
import {
  explainPerformances,
  type MarkerMeasure,
  type ProgressMarker,
  type SetValues,
} from "../domain/markers.ts";
import type { Database, ExerciseType } from "../schema/tables.ts";

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

export type RawSet = Omit<LoggedSet, "marker" | "markerBasis"> & {
  sessionExerciseId: string;
};

export interface RawPerformance {
  sessionId: string;
  startedAt: number;
  tz: string;
  sets: RawSet[];
}

/**
 * Every performance of the exercise, oldest first, through `upTo` if given.
 * A session that has the exercise twice counts as one performance, in
 * session order.
 */
export async function loadPerformances(
  db: Kysely<Database>,
  exerciseId: string,
  upTo?: { sessionId: string; startedAt: number },
): Promise<RawPerformance[]> {
  let query = db
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
    .where("s.deleted", "=", 0);
  if (upTo) {
    query = query.where((eb) =>
      eb.or([
        eb("s.started_at", "<", upTo.startedAt),
        eb.and([
          eb("s.started_at", "=", upTo.startedAt),
          eb("s.id", "<=", upTo.sessionId),
        ]),
      ]),
    );
  }
  const rows = await query
    .orderBy("s.started_at")
    .orderBy("s.id")
    .orderBy("se.position")
    .orderBy("se.id")
    .orderBy("sl.position")
    .orderBy("sl.id")
    .execute();

  const performances: RawPerformance[] = [];
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

/** Markers on every set, each judged against the history before it. */
export function markPerformanceSets(
  type: ExerciseType,
  performances: readonly RawPerformance[],
  e1rmRepCap: number,
): (Omit<Performance, "sets"> & {
  sets: (LoggedSet & { sessionExerciseId: string })[];
})[] {
  const bases = explainPerformances(
    type,
    performances.map((p) => p.sets),
    { e1rmRepCap },
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
  return performances.map((p, i) => ({
    ...p,
    sets: p.sets.map((set, j) => ({
      ...set,
      marker: bases[i]?.[j]?.marker ?? null,
      markerBasis: explain(i, j),
    })),
  }));
}

export function stripSessionExercise({
  sessionExerciseId: _,
  ...set
}: LoggedSet & { sessionExerciseId: string }): LoggedSet {
  return set;
}
