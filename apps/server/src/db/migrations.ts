import type { UntypedKysely } from "@workout-logger/core";
import {
  serverHeadOnlyMigration,
  serverSyncMigration,
} from "@workout-logger/core/sync-server";
import { getMigrations } from "better-auth/db/migration";
import type { Kysely } from "kysely";
import { type Migration, Migrator } from "kysely/migration";
import type { AuthOptions } from "../auth/auth.ts";
import type { ServerKysely } from "./database.ts";

// Released migrations are never edited; a change is a new entry. Names sort
// in the order they run.
const MIGRATIONS: Record<string, Migration> = {
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
};

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
