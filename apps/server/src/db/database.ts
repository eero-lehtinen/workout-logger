import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createKysely } from "@workout-logger/core";
import { nodeDriver } from "@workout-logger/core/node";
import type {
  ServerDb,
  ServerSyncTables,
} from "@workout-logger/core/sync-server";
import Database from "better-sqlite3";
import type { Kysely } from "kysely";

/** Last run of each scheduled job, for catch-up after downtime and for `/api/status`. */
export interface JobRunTable {
  name: string;
  last_run_at: number;
  last_ok_at: number | null;
  last_error: string | null;
}

/** Server tables besides Better Auth's, which it types itself. */
export interface ServerTables extends ServerSyncTables {
  job_run: JobRunTable;
}

export type ServerKysely = Kysely<ServerTables>;

/** The same connection, typed for the shared sync module. */
export function syncDb(db: ServerKysely): ServerDb {
  return db as unknown as ServerDb;
}

export interface ServerDatabase {
  db: ServerKysely;
  sqlite: Database.Database;
  close(): Promise<void>;
}

/**
 * Opens the server database. Kysely runs every query on this one connection,
 * one at a time, which is the single writer that pull ordering depends on
 * (docs/sync.md#server-side).
 */
export function openDatabase(path: string): ServerDatabase {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  // Litestream's recommendations (docs/deployment.md#litestream). Known risk
  // of NORMAL: an OS crash or power loss, not a process or container
  // restart, can roll back the last seconds of commits, including pushes the
  // devices have already dropped from their outboxes.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  const db = createKysely<ServerTables>(nodeDriver(sqlite));
  return { db, sqlite, close: () => db.destroy() };
}
