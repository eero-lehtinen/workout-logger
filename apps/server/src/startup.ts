import { existsSync, rmSync } from "node:fs";
import { newEpoch } from "@workout-logger/core/sync-server";
import { createAuth, authOptions as toAuthOptions } from "./auth/auth.ts";
import { dailyKeys, preMigrationKey, uploadDbCopy } from "./backup/db-copy.ts";
import { type BackupStore, r2Store } from "./backup/r2.ts";
import type { ServerConfig } from "./config.ts";
import { openDatabase, type ServerKysely, syncDb } from "./db/database.ts";
import { migrateServer, pendingMigrations } from "./db/migrations.ts";
import type { Job } from "./jobs.ts";
import { DAILY_COPY_JOB } from "./status.ts";

/** The database, auth, and backup store, migrated and ready to serve. */
export async function openServer(config: ServerConfig) {
  const database = openDatabase(config.databasePath);
  const authSettings = {
    db: database.db as never,
    publicUrl: config.publicUrl,
    secret: config.authSecret,
    github: config.github,
  };
  const backups = config.backups ? r2Store(config.backups) : undefined;
  await prepareDatabase(database.db, toAuthOptions(authSettings), backups);
  await finishRestore(database.db, config.databasePath);
  const auth = createAuth(authSettings);
  // Better Auth initializes lazily and checks the schema; finish that before
  // a caller such as the CLI closes the database.
  await auth.$context;
  return { database, auth, backups };
}

/**
 * Copies the database to R2 before any migration changes it, then migrates
 * (docs/migrations.md#server-migrations). Refuses to migrate a database that
 * has data when the copy fails.
 */
export async function prepareDatabase(
  db: ServerKysely,
  authOptions: ReturnType<typeof toAuthOptions>,
  backups: BackupStore | undefined,
): Promise<void> {
  const pending = await pendingMigrations(db, authOptions);
  if (pending.length === 0) return;
  const tables = await db.introspection.getTables();
  if (tables.length > 0) {
    if (backups) {
      const key = preMigrationKey(new Date(), pending[0] ?? "unknown");
      await uploadDbCopy(db, backups, key);
      console.log(`Copied the database to ${key} before migrating`);
    } else {
      console.warn("No backup bucket configured; migrating without a copy");
    }
  }
  console.log(`Migrating: ${pending.join(", ")}`);
  await migrateServer(db, authOptions);
}

/** Written next to the database by whatever restored it (deploy/compose.yaml). */
export const restoredMarker = (databasePath: string) =>
  `${databasePath}.restored`;

/**
 * Starts a new epoch when the database was restored, before serving: a
 * replica lags the lost database, and devices must re-upload what it lacks
 * (docs/sync.md#server-restore-and-epoch). The marker goes only after the
 * epoch, so a crash in between repeats it, which is harmless.
 */
export async function finishRestore(
  db: ServerKysely,
  databasePath: string,
): Promise<void> {
  const marker = restoredMarker(databasePath);
  if (!existsSync(marker)) return;
  console.log(`Restored database: new epoch ${await newEpoch(syncDb(db))}`);
  rmSync(marker);
}

export function dailyCopyJob(db: ServerKysely, backups: BackupStore): Job {
  return {
    name: DAILY_COPY_JOB,
    schedule: "0 3 * * *",
    maxAgeMs: 24 * 60 * 60 * 1000,
    async run() {
      for (const key of dailyKeys(new Date())) {
        await uploadDbCopy(db, backups, key);
      }
    },
  };
}
