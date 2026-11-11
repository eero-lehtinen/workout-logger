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

/** What a user stored on one UTC day (docs/accounts.md#quotas). */
export interface UsageTable {
  user_id: string;
  /** `YYYY-MM-DD`, UTC. */
  day: string;
  /** UTF-8 bytes of the `data` of versions stored. */
  bytes_written: number;
  snapshots: number;
}

/** The owner's overrides of a user's quotas. NULL is the default. */
export interface QuotaTable {
  user_id: string;
  bytes_per_day: number | null;
  max_bytes: number | null;
  requests_per_minute: number | null;
  snapshots_per_day: number | null;
  /** Epoch ms until which the daily write limit is lifted. */
  exempt_until: number | null;
}

/** Server-wide limits the owner sets; one row, id 1. NULL is the built-in value. */
export interface LimitsTable {
  id: number;
  max_accounts: number | null;
}

/** The columns of Better Auth's `user` table that the server reads itself. */
export interface UserTable {
  id: string;
  name: string;
  email: string;
  role: string | null;
  /** 0 or 1. */
  disabled: number | null;
  /** As Better Auth writes it on SQLite: ISO text, or epoch ms. */
  createdAt: string | number;
}

/** Server tables besides Better Auth's, which it types itself. */
export interface ServerTables extends ServerSyncTables {
  job_run: JobRunTable;
  usage: UsageTable;
  quota: QuotaTable;
  limits: LimitsTable;
  user: UserTable;
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
  // Better Auth's session and account tables cascade from user; SQLite
  // ignores that without this. The sync tables declare no foreign keys.
  sqlite.pragma("foreign_keys = ON");
  const db = createKysely<ServerTables>(nodeDriver(sqlite));
  return { db, sqlite, close: () => db.destroy() };
}
