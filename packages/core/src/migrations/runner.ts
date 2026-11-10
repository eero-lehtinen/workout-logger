import { sql } from "kysely";
import { MIGRATIONS } from "./index.ts";
import type { Migration, RowData, RowUpgrade, UntypedKysely } from "./types.ts";
import { latestVersion } from "./upgrade.ts";

export class SchemaTooNewError extends Error {
  readonly found: number;
  readonly supported: number;

  constructor(found: number, supported: number) {
    super(
      `database schema version ${found} is newer than this app supports (${supported}); update the app`,
    );
    this.name = "SchemaTooNewError";
    this.found = found;
    this.supported = supported;
  }
}

export interface MigrateOptions {
  migrations?: readonly Migration[];
  /**
   * Called before an existing database is migrated, outside the migration
   * transaction. Copies the database file so a broken migration can be rolled
   * back by hand. Not called for a new database.
   */
  beforeMigrate?: (from: number, to: number) => Promise<void>;
}

export async function readSchemaVersion(db: UntypedKysely): Promise<number> {
  const { rows } = await sql<{
    user_version: number;
  }>`pragma user_version`.execute(db);
  return rows[0]?.user_version ?? 0;
}

/** Brings the database to the latest version in one transaction. */
export async function migrate(
  db: UntypedKysely,
  options: MigrateOptions = {},
): Promise<{ from: number; to: number }> {
  const migrations = options.migrations ?? MIGRATIONS;
  const to = latestVersion(migrations);
  const from = await readSchemaVersion(db);
  if (from > to) throw new SchemaTooNewError(from, to);
  if (from === to) return { from, to };
  if (from > 0) await options.beforeMigrate?.(from, to);

  await db.transaction().execute(async (trx) => {
    for (const migration of migrations) {
      if (migration.version <= from) continue;
      await migration.up(trx);
      if (migration.upgrade) await upgradeStoredRows(trx, migration.upgrade);
      await migration.cleanup?.(trx);
      await sql.raw(`pragma user_version = ${migration.version}`).execute(trx);
    }
    // Undo entries hold row versions in the old format.
    if (from > 0) await trx.deleteFrom("_undo").execute();
  });
  return { from, to };
}

/**
 * Rewrites stored rows through one step's upgrades. HLCs and deleted flags are
 * kept and nothing new is queued for sync: every device computes the same
 * result. A row that was already waiting in the outbox stays queued under its
 * new table and id.
 */
async function upgradeStoredRows(
  trx: UntypedKysely,
  upgrades: Readonly<Record<string, RowUpgrade>>,
) {
  // Read everything first, so rows produced by one table's upgrade aren't
  // upgraded again as rows of their target table.
  const sources = [];
  for (const [table, upgrade] of Object.entries(upgrades)) {
    const rows = await trx.selectFrom(table).selectAll().execute();
    const queued = await trx
      .selectFrom("_outbox")
      .select("id")
      .where("table_name", "=", table)
      .execute();
    sources.push({
      table,
      upgrade,
      rows,
      queued: new Set(queued.map((r) => r.id)),
    });
  }

  for (const { table, upgrade, rows, queued } of sources) {
    for (const { id, hlc, deleted, ...data } of rows) {
      const sourceId = String(id);
      let keepsSource = false;
      for (const result of upgrade({ id: sourceId, data: data as RowData })) {
        if (result.table === table && result.id === sourceId) {
          keepsSource = true;
        }
        await trx
          .replaceInto(result.table)
          .values({ ...result.data, id: result.id, hlc, deleted })
          .execute();
        if (queued.has(sourceId)) {
          await trx
            .insertInto("_outbox")
            .values({ table_name: result.table, id: result.id })
            .onConflict((oc) => oc.doNothing())
            .execute();
        }
      }
      if (!keepsSource) {
        await trx.deleteFrom(table).where("id", "=", sourceId).execute();
        await trx
          .deleteFrom("_outbox")
          .where("table_name", "=", table)
          .where("id", "=", sourceId)
          .execute();
      }
    }
  }
}
