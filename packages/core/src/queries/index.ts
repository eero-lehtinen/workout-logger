import type { QueryDef } from "./define.ts";
import { exerciseLog } from "./exercise-log.ts";
import {
  exerciseDetail,
  exercises,
  muscles,
  substitutionOptions,
} from "./exercises.ts";
import { exerciseHistory, sessionsInRange, trainingStats } from "./history.ts";
import { routineDetail, routines } from "./routines.ts";
import { recentSessions, sessionView, startOptions } from "./sessions.ts";
import { settings } from "./settings.ts";
import { syncStatus } from "./sync.ts";

/** Every query the UI can run, by name. */
export const QUERIES = {
  settings,
  recentSessions,
  startOptions,
  sessionView,
  exerciseLog,
  exerciseHistory,
  sessionsInRange,
  trainingStats,
  muscles,
  exercises,
  exerciseDetail,
  substitutionOptions,
  routines,
  routineDetail,
  syncStatus,
} satisfies Record<string, QueryDef<never, unknown>>;

/** The queries to refetch after a commit that changed `tables`. */
export function queriesAffectedBy(
  tables: ReadonlySet<string>,
): (keyof typeof QUERIES)[] {
  return (Object.keys(QUERIES) as (keyof typeof QUERIES)[]).filter((name) =>
    QUERIES[name].tables.some((t) => tables.has(t)),
  );
}

export type Queries = typeof QUERIES;
export type QueryName = keyof Queries;
export type QueryArgs<N extends QueryName> = Parameters<Queries[N]["run"]>[1];
export type QueryResult<N extends QueryName> = Awaited<
  ReturnType<Queries[N]["run"]>
>;

export type { QueryDef } from "./define.ts";
export { type ExerciseLog, PREVIOUS_PERFORMANCES } from "./exercise-log.ts";
export type {
  ExerciseDetail,
  ExerciseItem,
  MuscleItem,
  SubstitutionOptions,
} from "./exercises.ts";
export type {
  CalendarSession,
  ExerciseHistory,
  TrainingStats,
} from "./history.ts";
export type {
  LoggedSet,
  MarkerExplanation,
  Performance,
} from "./performances.ts";
export type { RoutineDetail, RoutineItem } from "./routines.ts";
export type {
  SessionExerciseItem,
  SessionSummary,
  SessionView,
  StartOptions,
} from "./sessions.ts";
export type { SyncStatus } from "./sync.ts";
