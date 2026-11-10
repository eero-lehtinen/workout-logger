import type { Generated } from "kysely";
import type { UntypedKysely } from "../../migrations/types.ts";

/** Append-only log of every change received. */
export interface ChangeTable {
  seq: Generated<number>;
  user_id: string;
  table_name: string;
  id: string;
  hlc: string;
  deleted: number;
  v: number;
  /** Canonical JSON object of columns, never interpreted. */
  data: string;
  device_id: string;
  received_at: number;
}

/** The latest change by HLC per row, for snapshots and backups. */
export interface HeadTable {
  user_id: string;
  table_name: string;
  id: string;
  hlc: string;
  deleted: number;
  v: number;
  data: string;
  seq: number;
}

export interface ServerMetaTable {
  key: "epoch";
  value: string;
}

export interface UserSyncTable {
  user_id: string;
  /** Newest schema version seen from this user. */
  max_v: number;
}

export interface ServerSyncTables {
  change: ChangeTable;
  head: HeadTable;
  server_meta: ServerMetaTable;
  user_sync: UserSyncTable;
}

/**
 * Creates the sync tables. The server runs this as one step of its own Kysely
 * migrations; like any released migration it is never edited afterwards.
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
