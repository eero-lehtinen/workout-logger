import Database from "better-sqlite3";
import { sql } from "kysely";
import { createKysely } from "./db/driver.ts";
import { nodeDriver, openNodeDriver } from "./db/node-driver.ts";
import { MIGRATIONS } from "./migrations/index.ts";
import { migrate } from "./migrations/runner.ts";
import type { Migration, RowData, UntypedKysely } from "./migrations/types.ts";
import { upgradeRow } from "./migrations/upgrade.ts";
import type { Flag } from "./schema/tables.ts";
import { openStore, type Store, type StoreOptions } from "./store/store.ts";
import {
  type ServerSyncTables,
  serverHeadOnlyMigration,
  serverPerUserSeqMigration,
  serverSyncMigration,
} from "./sync/server/schema.ts";
import type { ServerDb } from "./sync/server/sync.ts";

/**
 * In-memory server sync tables. `serialize` and passing its bytes back stand in
 * for a whole-database backup and restore.
 */
export async function openTestServer(bytes?: Uint8Array): Promise<{
  db: ServerDb;
  serialize: () => Uint8Array;
  close: () => Promise<void>;
}> {
  const sqlite = new Database(bytes ? Buffer.from(bytes) : ":memory:");
  const db = createKysely<ServerSyncTables>(nodeDriver(sqlite));
  if (!bytes) {
    await serverSyncMigration.up(db as unknown as UntypedKysely);
    await serverHeadOnlyMigration.up(db as unknown as UntypedKysely);
    await serverPerUserSeqMigration.up(db as unknown as UntypedKysely);
  }
  return { db, serialize: () => sqlite.serialize(), close: () => db.destroy() };
}

/** A store on an in-memory better-sqlite3 database. */
export function openTestStore(options?: StoreOptions): Promise<Store> {
  return openStore(openNodeDriver(), options);
}

/** An in-memory database migrated up to `version`. */
export async function openDatabaseAt(
  version: number,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<UntypedKysely> {
  const db = createKysely<Record<string, Record<string, unknown>>>(
    openNodeDriver(),
  );
  await migrate(db, { migrations: migrations.slice(0, version) });
  return db;
}

export interface FixtureRow {
  table: string;
  id: string;
  hlc: string;
  deleted?: Flag;
  data: RowData;
}

export async function insertRows(
  db: UntypedKysely,
  rows: readonly FixtureRow[],
) {
  for (const { table, id, hlc, deleted = 0, data } of rows) {
    await db
      .insertInto(table)
      .values({ ...data, id, hlc, deleted })
      .execute();
  }
}

/** Every synced table's rows, sorted by id. Local `_` tables are left out. */
export async function dumpSyncedTables(
  db: UntypedKysely,
): Promise<Record<string, Record<string, unknown>[]>> {
  const { rows: tables } = await sql<{ name: string }>`
    select name from sqlite_master
    where type = 'table' and name not like 'sqlite_%' and substr(name, 1, 1) != '_'
    order by name`.execute(db);
  const dump: Record<string, Record<string, unknown>[]> = {};
  for (const { name } of tables) {
    dump[name] = await db.selectFrom(name).selectAll().orderBy("id").execute();
  }
  return dump;
}

/**
 * The equivalence check every migration step needs (docs/migrations.md): rows
 * stored at `fromVersion` and migrated must equal the same rows passed through
 * `upgradeRow` and inserted into a fresh database at the latest version.
 */
export async function migrateFixture(options: {
  fromVersion: number;
  rows: readonly FixtureRow[];
  migrations?: readonly Migration[];
}): Promise<{
  migrated: Record<string, Record<string, unknown>[]>;
  expected: Record<string, Record<string, unknown>[]>;
}> {
  const migrations = options.migrations ?? MIGRATIONS;

  const old = await openDatabaseAt(options.fromVersion, migrations);
  await insertRows(old, options.rows);
  await migrate(old, { migrations });

  const fresh = await openDatabaseAt(migrations.length, migrations);
  const upgraded = options.rows.flatMap((row) =>
    upgradeRow(row, options.fromVersion, migrations).map((result) => ({
      ...result,
      hlc: row.hlc,
      deleted: row.deleted ?? 0,
    })),
  );
  await insertRows(fresh, upgraded);

  const result = {
    migrated: await dumpSyncedTables(old),
    expected: await dumpSyncedTables(fresh),
  };
  await old.destroy();
  await fresh.destroy();
  return result;
}
