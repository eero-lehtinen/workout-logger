import { sql } from "kysely";
import type { UntypedKysely } from "../../migrations/types.ts";

/**
 * The newest version by HLC of every row. Pulls read it by `seq`, which a
 * row takes from the `seq` counter whenever a newer version replaces it.
 */
export interface HeadTable {
  user_id: string;
  table_name: string;
  id: string;
  hlc: string;
  deleted: number;
  v: number;
  /** Canonical JSON object of columns, never interpreted. */
  data: string;
  seq: number;
  /** The device that sent this version, and when. */
  device_id: string;
  received_at: number;
}

export interface ServerMetaTable {
  /**
   * `seq`: the last sequence number handed out, as decimal text.
   * `epoch_started_at`: epoch ms of the last `newEpoch`; absent before one.
   */
  key: "epoch" | "seq" | "epoch_started_at";
  value: string;
}

export interface UserSyncTable {
  user_id: string;
  /** Newest schema version seen from this user. */
  max_v: number;
}

export interface ServerSyncTables {
  head: HeadTable;
  server_meta: ServerMetaTable;
  user_sync: UserSyncTable;
}

/**
 * Creates the sync tables. The server runs this and the steps after it as
 * steps of its own Kysely migrations; like any released migration they are
 * never edited afterwards.
 */
export const serverSyncMigration = {
  async up(db: UntypedKysely): Promise<void> {
    await db.schema
      .createTable("change")
      .addColumn("seq", "integer", (c) => c.primaryKey().autoIncrement())
      .addColumn("user_id", "text", (c) => c.notNull())
      .addColumn("table_name", "text", (c) => c.notNull())
      .addColumn("id", "text", (c) => c.notNull())
      .addColumn("hlc", "text", (c) => c.notNull())
      .addColumn("deleted", "integer", (c) => c.notNull())
      .addColumn("v", "integer", (c) => c.notNull())
      .addColumn("data", "text", (c) => c.notNull())
      .addColumn("device_id", "text", (c) => c.notNull())
      .addColumn("received_at", "integer", (c) => c.notNull())
      .addUniqueConstraint("change_row_hlc", [
        "user_id",
        "table_name",
        "id",
        "hlc",
      ])
      .execute();
    await db.schema
      .createIndex("change_user_seq")
      .on("change")
      .columns(["user_id", "seq"])
      .execute();
    // The log is append-only: pull cursors and restores depend on it. Account
    // deletion, when it exists, needs its own way past these.
    for (const op of ["UPDATE", "DELETE"]) {
      await sql`CREATE TRIGGER ${sql.raw(`change_no_${op.toLowerCase()}`)}
        BEFORE ${sql.raw(op)} ON change
        BEGIN SELECT RAISE(ABORT, 'change is append-only'); END`.execute(db);
    }

    await db.schema
      .createTable("head")
      .addColumn("user_id", "text", (c) => c.notNull())
      .addColumn("table_name", "text", (c) => c.notNull())
      .addColumn("id", "text", (c) => c.notNull())
      .addColumn("hlc", "text", (c) => c.notNull())
      .addColumn("deleted", "integer", (c) => c.notNull())
      .addColumn("v", "integer", (c) => c.notNull())
      .addColumn("data", "text", (c) => c.notNull())
      .addColumn("seq", "integer", (c) => c.notNull())
      .addPrimaryKeyConstraint("head_pk", ["user_id", "table_name", "id"])
      .execute();

    await db.schema
      .createTable("server_meta")
      .addColumn("key", "text", (c) => c.primaryKey().notNull())
      .addColumn("value", "text", (c) => c.notNull())
      .execute();
    await db
      .insertInto("server_meta")
      .values({ key: "epoch", value: crypto.randomUUID() })
      .execute();

    await db.schema
      .createTable("user_sync")
      .addColumn("user_id", "text", (c) => c.primaryKey().notNull())
      .addColumn("max_v", "integer", (c) => c.notNull())
      .execute();
  },
};

/**
 * Drops the change log and keeps only `head`, rebuilt without a rowid so the
 * primary key isn't stored twice (docs/sync.md#server-side). The counter
 * starts at the log's last `seq`, so cursors devices already hold stay valid
 * and no new number repeats an old one.
 */
export const serverHeadOnlyMigration = {
  up: headOnly,
};

async function headOnly(db: UntypedKysely): Promise<void> {
  await sql`CREATE TABLE head_new (
      user_id     TEXT NOT NULL,
      table_name  TEXT NOT NULL,
      id          TEXT NOT NULL,
      hlc         TEXT NOT NULL,
      deleted     INTEGER NOT NULL,
      v           INTEGER NOT NULL,
      data        TEXT NOT NULL,
      seq         INTEGER NOT NULL,
      device_id   TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, table_name, id)
    ) WITHOUT ROWID`.execute(db);
  await sql`INSERT INTO head_new
      SELECT h.user_id, h.table_name, h.id, h.hlc, h.deleted, h.v, h.data,
        h.seq, coalesce(c.device_id, ''), coalesce(c.received_at, 0)
      FROM head h LEFT JOIN change c ON c.seq = h.seq`.execute(db);
  await db
    .insertInto("server_meta")
    .values({
      key: "seq",
      value: sql<string>`(SELECT CAST(coalesce(max(seq), 0) AS TEXT) FROM change)`,
    })
    .execute();
  await db.schema.dropTable("head").execute();
  await db.schema.dropTable("change").execute();
  await sql`ALTER TABLE head_new RENAME TO head`.execute(db);
  await db.schema
    .createIndex("head_user_seq")
    .on("head")
    .columns(["user_id", "seq"])
    .execute();
}
