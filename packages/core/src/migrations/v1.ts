import type { Migration, UntypedKysely } from "./types.ts";

// Released migrations are never edited. Later steps must not import helpers
// from here that could change.

function syncedTable(db: UntypedKysely, name: string) {
  return db.schema
    .createTable(name)
    .addColumn("id", "text", (c) => c.primaryKey().notNull())
    .addColumn("hlc", "text", (c) => c.notNull())
    .addColumn("deleted", "integer", (c) => c.notNull().defaultTo(0));
}

async function index(db: UntypedKysely, table: string, columns: string[]) {
  await db.schema
    .createIndex(`${table}_${columns.join("_")}`)
    .on(table)
    .columns(columns)
    .execute();
}

export const v1: Migration = {
  version: 1,
  async up(db) {
    await syncedTable(db, "muscle")
      .addColumn("name", "text", (c) => c.notNull())
      .addColumn("group_name", "text", (c) => c.notNull())
      .execute();

    await syncedTable(db, "exercise")
      .addColumn("name", "text", (c) => c.notNull())
      .addColumn("type", "text", (c) => c.notNull())
      .addColumn("default_rest_s", "integer")
      .addColumn("weight_increment_kg", "real")
      .addColumn("notes", "text", (c) => c.notNull().defaultTo(""))
      .addColumn("archived", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("builtin_key", "text")
      .execute();

    await syncedTable(db, "exercise_muscle")
      .addColumn("exercise_id", "text", (c) => c.notNull())
      .addColumn("muscle_id", "text", (c) => c.notNull())
      .addColumn("factor", "real", (c) => c.notNull())
      .execute();
    await index(db, "exercise_muscle", ["exercise_id"]);
    await index(db, "exercise_muscle", ["muscle_id"]);

    await syncedTable(db, "routine")
      .addColumn("name", "text", (c) => c.notNull())
      .addColumn("position", "text", (c) => c.notNull())
      .addColumn("archived", "integer", (c) => c.notNull().defaultTo(0))
      .execute();

    await syncedTable(db, "routine_day")
      .addColumn("routine_id", "text", (c) => c.notNull())
      .addColumn("name", "text", (c) => c.notNull())
      .addColumn("position", "text", (c) => c.notNull())
      .execute();
    await index(db, "routine_day", ["routine_id", "position"]);

    await syncedTable(db, "slot")
      .addColumn("day_id", "text", (c) => c.notNull())
      .addColumn("exercise_id", "text", (c) => c.notNull())
      .addColumn("position", "text", (c) => c.notNull())
      .addColumn("rest_s", "integer")
      .addColumn("note", "text")
      .execute();
    await index(db, "slot", ["day_id", "position"]);

    await syncedTable(db, "slot_alternative")
      .addColumn("slot_id", "text", (c) => c.notNull())
      .addColumn("exercise_id", "text", (c) => c.notNull())
      .addColumn("position", "text", (c) => c.notNull())
      .execute();
    await index(db, "slot_alternative", ["slot_id", "position"]);

    await syncedTable(db, "session")
      .addColumn("routine_id", "text")
      .addColumn("day_id", "text")
      .addColumn("started_at", "integer", (c) => c.notNull())
      .addColumn("tz", "text", (c) => c.notNull())
      .addColumn("ended_at", "integer")
      .addColumn("end_reason", "text")
      .addColumn("notes", "text", (c) => c.notNull().defaultTo(""))
      .execute();
    await index(db, "session", ["started_at"]);
    await index(db, "session", ["routine_id", "started_at"]);

    await syncedTable(db, "session_exercise")
      .addColumn("session_id", "text", (c) => c.notNull())
      .addColumn("slot_id", "text")
      .addColumn("exercise_id", "text", (c) => c.notNull())
      .addColumn("position", "text", (c) => c.notNull())
      .addColumn("notes", "text", (c) => c.notNull().defaultTo(""))
      .execute();
    await index(db, "session_exercise", ["session_id", "position"]);
    await index(db, "session_exercise", ["exercise_id"]);

    await syncedTable(db, "set_log")
      .addColumn("session_exercise_id", "text", (c) => c.notNull())
      .addColumn("position", "text", (c) => c.notNull())
      .addColumn("logged_at", "integer", (c) => c.notNull())
      .addColumn("weight_kg", "real")
      .addColumn("reps", "integer")
      .addColumn("duration_s", "real")
      .addColumn("distance_m", "real")
      .execute();
    await index(db, "set_log", ["session_exercise_id", "position"]);

    await syncedTable(db, "metric")
      .addColumn("name", "text", (c) => c.notNull())
      .addColumn("unit", "text", (c) => c.notNull())
      .addColumn("builtin_key", "text")
      .addColumn("position", "text", (c) => c.notNull())
      .addColumn("archived", "integer", (c) => c.notNull().defaultTo(0))
      .execute();

    await syncedTable(db, "measurement")
      .addColumn("metric_id", "text", (c) => c.notNull())
      .addColumn("measured_at", "integer", (c) => c.notNull())
      .addColumn("value", "real", (c) => c.notNull())
      .addColumn("source", "text", (c) => c.notNull())
      .addColumn("external_id", "text")
      .addColumn("note", "text", (c) => c.notNull().defaultTo(""))
      .execute();
    await index(db, "measurement", ["metric_id", "measured_at"]);

    await syncedTable(db, "setting")
      .addColumn("value_json", "text", (c) => c.notNull())
      .execute();

    await db.schema
      .createTable("_outbox")
      .addColumn("table_name", "text", (c) => c.notNull())
      .addColumn("id", "text", (c) => c.notNull())
      .addPrimaryKeyConstraint("_outbox_pk", ["table_name", "id"])
      .execute();

    await db.schema
      .createTable("_sync_state")
      .addColumn("key", "text", (c) => c.primaryKey().notNull())
      .addColumn("value", "text", (c) => c.notNull())
      .execute();

    await db.schema
      .createTable("_undo")
      .addColumn("seq", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("tx", "integer", (c) => c.notNull())
      .addColumn("table_name", "text", (c) => c.notNull())
      .addColumn("id", "text", (c) => c.notNull())
      .addColumn("previous", "text")
      .execute();
    await index(db, "_undo", ["tx"]);
    await index(db, "_undo", ["table_name", "id"]);
  },
};
