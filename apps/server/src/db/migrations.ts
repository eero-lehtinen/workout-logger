import type { UntypedKysely } from "@workout-logger/core";
import {
  serverHeadOnlyMigration,
  serverSyncMigration,
} from "@workout-logger/core/sync-server";
import { getMigrations } from "better-auth/db/migration";
import { type Kysely, sql } from "kysely";
import { type Migration, Migrator } from "kysely/migration";
import type { AuthOptions } from "../auth/auth.ts";
import type { ServerKysely } from "./database.ts";

// Released migrations are never edited; a change is a new entry. Names sort
// in the order they run.
const STEPS: Record<string, Migration> = {
  "0001_sync": {
    up: (db: Kysely<unknown>) =>
      serverSyncMigration.up(db as unknown as UntypedKysely),
  },
  "0002_job_run": {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable("job_run")
        .addColumn("name", "text", (c) => c.primaryKey().notNull())
        .addColumn("last_run_at", "integer", (c) => c.notNull())
        .addColumn("last_ok_at", "integer")
        .addColumn("last_error", "text")
        .execute();
    },
  },
  "0003_sync_head_only": {
    up: (db: Kysely<unknown>) =>
      serverHeadOnlyMigration.up(db as unknown as UntypedKysely),
  },
  "0004_quotas": {
    async up(db: Kysely<unknown>) {
      await sql`CREATE TABLE usage (
        user_id       TEXT NOT NULL,
        day           TEXT NOT NULL,
        bytes_written INTEGER NOT NULL DEFAULT 0,
        snapshots     INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day)
      ) WITHOUT ROWID`.execute(db);
      await db.schema
        .createTable("quota")
        .addColumn("user_id", "text", (c) => c.primaryKey().notNull())
        .addColumn("bytes_per_day", "integer")
        .addColumn("max_bytes", "integer")
        .addColumn("requests_per_minute", "integer")
        .addColumn("snapshots_per_day", "integer")
        .addColumn("exempt_until", "integer")
        .execute();
      await sql`CREATE TABLE limits (
        id           INTEGER PRIMARY KEY CHECK (id = 1),
        max_accounts INTEGER
      )`.execute(db);
      await sql`INSERT INTO limits (id) VALUES (1)`.execute(db);
    },
  },
  "0005_bans": {
    async up(db: Kysely<unknown>) {
      await sql`CREATE TABLE ban (
        user_id    TEXT PRIMARY KEY NOT NULL,
        name       TEXT NOT NULL,
        email      TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`.execute(db);
      await sql`CREATE TABLE ban_key (
        user_id TEXT NOT NULL,
        key     TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
      ) WITHOUT ROWID`.execute(db);
    },
  },
};

// Kysely runs SQLite migrations without a transaction (its SQLite adapter
// reports no transactional DDL, though SQLite has it). A step stopped halfway
// would leave part of itself behind, and its rerun at the next start would
// fail on it; in a transaction it leaves nothing and simply runs again.
const MIGRATIONS: Record<string, Migration> = Object.fromEntries(
  Object.entries(STEPS).map(([name, step]) => [
    name,
    { up: (db) => db.transaction().execute((trx) => step.up(trx)) },
  ]),
);

function migrator(db: ServerKysely) {
  return new Migrator({
    db,
    provider: { getMigrations: async () => MIGRATIONS },
  });
}

/** What startup would change; empty when the database is current. */
export async function pendingMigrations(
  db: ServerKysely,
  authOptions: AuthOptions,
): Promise<string[]> {
  const own = (await migrator(db).getMigrations())
    .filter((m) => m.executedAt === undefined)
    .map((m) => m.name);
  const auth = await getMigrations(authOptions);
  const authChanges = [
    ...auth.toBeCreated.map((t) => `auth:create:${t.table}`),
    ...auth.toBeAdded.map((t) => `auth:add:${t.table}`),
  ];
  return [...own, ...authChanges];
}

/**
 * Runs the server's own migrations, then Better Auth's. See
 * docs/migrations.md#server-migrations.
 */
export async function migrateServer(
  db: ServerKysely,
  authOptions: AuthOptions,
): Promise<void> {
  const { error, results } = await migrator(db).migrateToLatest();
  for (const result of results ?? []) {
    if (result.status === "Error") {
      console.error(`Migration ${result.migrationName} failed`);
    }
  }
  if (error) throw error;
  const auth = await getMigrations(authOptions);
  await auth.runMigrations();
}
