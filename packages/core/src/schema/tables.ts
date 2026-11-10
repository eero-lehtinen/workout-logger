import type { Generated } from "kysely";

/** Domain schema version, also the `v` of synced rows. See docs/migrations.md. */
export const SCHEMA_VERSION = 1;

/** SQLite has no boolean type. */
export type Flag = 0 | 1;

export type ExerciseType =
  | "weight_reps"
  | "bodyweight_reps"
  | "reps"
  | "time"
  | "distance_time";
export type SessionEndReason = "manual" | "unknown";
export type MeasurementSource = "manual" | "health_connect" | "import";

interface SyncedColumns {
  id: string;
  hlc: string;
  deleted: Flag;
}

// Timestamps (`*_at`) are UTC epoch milliseconds. Weights are kg.

export interface MuscleTable extends SyncedColumns {
  name: string;
  group_name: string;
}

export interface ExerciseTable extends SyncedColumns {
  name: string;
  type: ExerciseType;
  default_rest_s: number | null;
  weight_increment_kg: number | null;
  notes: string;
  archived: Flag;
  builtin_key: string | null;
}

export interface ExerciseMuscleTable extends SyncedColumns {
  exercise_id: string;
  muscle_id: string;
  factor: number;
}

export interface RoutineTable extends SyncedColumns {
  name: string;
  position: string;
  archived: Flag;
}

export interface RoutineDayTable extends SyncedColumns {
  routine_id: string;
  name: string;
  position: string;
}

export interface SlotTable extends SyncedColumns {
  day_id: string;
  exercise_id: string;
  position: string;
  rest_s: number | null;
  note: string | null;
}

export interface SlotAlternativeTable extends SyncedColumns {
  slot_id: string;
  exercise_id: string;
  position: string;
}

export interface SessionTable extends SyncedColumns {
  routine_id: string | null;
  day_id: string | null;
  started_at: number;
  /** IANA zone at start. */
  tz: string;
  ended_at: number | null;
  end_reason: SessionEndReason | null;
  notes: string;
}

export interface SessionExerciseTable extends SyncedColumns {
  session_id: string;
  slot_id: string | null;
  exercise_id: string;
  position: string;
  notes: string;
}

export interface SetLogTable extends SyncedColumns {
  session_exercise_id: string;
  position: string;
  logged_at: number;
  weight_kg: number | null;
  reps: number | null;
  duration_s: number | null;
  distance_m: number | null;
}

export interface MetricTable extends SyncedColumns {
  name: string;
  unit: string;
  builtin_key: string | null;
  position: string;
  archived: Flag;
}

export interface MeasurementTable extends SyncedColumns {
  metric_id: string;
  measured_at: number;
  value: number;
  source: MeasurementSource;
  external_id: string | null;
  note: string;
}

/** `id` is the setting key. */
export interface SettingTable extends SyncedColumns {
  value_json: string;
}

export interface SyncedTables {
  muscle: MuscleTable;
  exercise: ExerciseTable;
  exercise_muscle: ExerciseMuscleTable;
  routine: RoutineTable;
  routine_day: RoutineDayTable;
  slot: SlotTable;
  slot_alternative: SlotAlternativeTable;
  session: SessionTable;
  session_exercise: SessionExerciseTable;
  set_log: SetLogTable;
  metric: MetricTable;
  measurement: MeasurementTable;
  setting: SettingTable;
}

export type SyncedTableName = keyof SyncedTables;

/** Rows written on this device that the server hasn't acknowledged yet. */
export interface OutboxTable {
  table_name: string;
  id: string;
}

/** Device-local key-value state. Never exported or restored onto another device. */
export interface SyncStateTable {
  key: SyncStateKey;
  value: string;
}

export type SyncStateKey =
  | "device_id"
  | "last_hlc"
  | "server_epoch"
  | "cursor"
  | "last_sync_at"
  /** The account this device syncs with, kept after logout. */
  | "user_id"
  /** The newest HLC the server accepted that this device knows of. */
  | "accepted_hlc";

/** Previous row versions of recent write transactions. */
export interface UndoTable {
  seq: Generated<number>;
  tx: number;
  table_name: string;
  id: string;
  /** JSON `{ deleted, data }`, or null if the row didn't exist. */
  previous: string | null;
}

export interface LocalTables {
  _outbox: OutboxTable;
  _sync_state: SyncStateTable;
  _undo: UndoTable;
}

export interface Database extends SyncedTables, LocalTables {}

export type TableName = keyof Database;

/** A synced row without its sync columns: the `data` of a change. */
export type DomainRow<T extends SyncedTableName> = Omit<
  SyncedTables[T],
  keyof SyncedColumns
>;

type NullableKeys<R> = {
  [K in keyof R]-?: null extends R[K] ? K : never;
}[keyof R];

/** A new row: nullable columns may be omitted and default to null. */
export type NewRow<T extends SyncedTableName> = Omit<
  DomainRow<T>,
  NullableKeys<DomainRow<T>>
> &
  Partial<Pick<DomainRow<T>, NullableKeys<DomainRow<T>>>>;

/**
 * Domain columns of each synced table at SCHEMA_VERSION, in DDL order. Sync
 * and the write API build rows from this list; a test checks it against the
 * migrated database.
 */
export const SYNCED_COLUMNS: {
  readonly [T in SyncedTableName]: readonly (keyof DomainRow<T>)[];
} = {
  muscle: ["name", "group_name"],
  exercise: [
    "name",
    "type",
    "default_rest_s",
    "weight_increment_kg",
    "notes",
    "archived",
    "builtin_key",
  ],
  exercise_muscle: ["exercise_id", "muscle_id", "factor"],
  routine: ["name", "position", "archived"],
  routine_day: ["routine_id", "name", "position"],
  slot: ["day_id", "exercise_id", "position", "rest_s", "note"],
  slot_alternative: ["slot_id", "exercise_id", "position"],
  session: [
    "routine_id",
    "day_id",
    "started_at",
    "tz",
    "ended_at",
    "end_reason",
    "notes",
  ],
  session_exercise: [
    "session_id",
    "slot_id",
    "exercise_id",
    "position",
    "notes",
  ],
  set_log: [
    "session_exercise_id",
    "position",
    "logged_at",
    "weight_kg",
    "reps",
    "duration_s",
    "distance_m",
  ],
  metric: ["name", "unit", "builtin_key", "position", "archived"],
  measurement: [
    "metric_id",
    "measured_at",
    "value",
    "source",
    "external_id",
    "note",
  ],
  setting: ["value_json"],
};

export const SYNCED_TABLES = Object.keys(SYNCED_COLUMNS) as SyncedTableName[];

export function isSyncedTable(name: string): name is SyncedTableName {
  return Object.hasOwn(SYNCED_COLUMNS, name);
}
