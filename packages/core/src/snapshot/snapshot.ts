import { sql } from "kysely";
import { migrate, SchemaTooNewError } from "../migrations/runner.ts";
import type { RowData, UntypedKysely } from "../migrations/types.ts";
import { upgradeRow } from "../migrations/upgrade.ts";
import {
  type Flag,
  isSyncedTable,
  type NewRow,
  SCHEMA_VERSION,
  SYNCED_TABLES,
  type SyncedTableName,
} from "../schema/tables.ts";
import { TxClock } from "../store/clock.ts";
import {
  enqueue,
  pickColumns,
  readHlc,
  readRow,
  untyped,
  upsertRow,
} from "../store/rows.ts";
import type { Store } from "../store/store.ts";
import { dropUndoFor } from "../store/undo.ts";
import { isValidHlc } from "../sync/hlc.ts";

/**
 * A user snapshot: a SQLite file with the app's tables at the time of export,
 * synced rows including tombstones, local tables empty, plus `meta`. See
 * docs/backups.md#snapshot-format.
 */
export interface SnapshotMeta {
  schemaVersion: number;
  createdAt: number;
  /** Where it was made, e.g. `device` or `server`. */
  source: string;
  serverEpoch: string | null;
}

export interface SnapshotRow {
  table: SyncedTableName;
  id: string;
  hlc: string;
  deleted: Flag;
  data: RowData;
}

export class InvalidSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSnapshotError";
  }
}

const INSERT_BATCH = 100;

/** Writes the store's synced rows into the empty database `target`. */
export async function writeSnapshot(
  store: Store,
  target: UntypedKysely,
  source = "device",
): Promise<SnapshotMeta> {
  await migrate(target);
  await target.schema
    .createTable("meta")
    .addColumn("key", "text", (c) => c.primaryKey().notNull())
    .addColumn("value", "text", (c) => c.notNull())
    .execute();

  // One read transaction, so the snapshot is consistent across tables.
  const epoch = await store.db.transaction().execute(async (trx) => {
    for (const table of SYNCED_TABLES) {
      const rows = await untyped(trx).selectFrom(table).selectAll().execute();
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        await target
          .insertInto(table)
          .values(rows.slice(i, i + INSERT_BATCH))
          .execute();
      }
    }
    const row = await trx
      .selectFrom("_sync_state")
      .select("value")
      .where("key", "=", "server_epoch")
      .executeTakeFirst();
    return row?.value ?? null;
  });

  const meta: SnapshotMeta = {
    schemaVersion: SCHEMA_VERSION,
    createdAt: store.now(),
    source,
    serverEpoch: epoch,
  };
  await target
    .insertInto("meta")
    .values([
      { key: "schema_version", value: String(meta.schemaVersion) },
      { key: "created_at", value: String(meta.createdAt) },
      { key: "source", value: meta.source },
      ...(epoch === null ? [] : [{ key: "server_epoch", value: epoch }]),
    ])
    .execute();
  return meta;
}

/**
 * Reads a snapshot's rows, upgraded to the current schema version. Throws
 * `SchemaTooNewError` for a snapshot from a newer app.
 */
export async function readSnapshot(
  source: UntypedKysely,
): Promise<{ meta: SnapshotMeta; rows: SnapshotRow[] }> {
  const meta = await readMeta(source);
  if (meta.schemaVersion > SCHEMA_VERSION) {
    throw new SchemaTooNewError(meta.schemaVersion, SCHEMA_VERSION);
  }
  const { rows: tables } = await sql<{ name: string }>`
    select name from sqlite_master
    where type = 'table' and name not like 'sqlite_%'
      and substr(name, 1, 1) != '_' and name != 'meta'`.execute(source);

  const rows: SnapshotRow[] = [];
  for (const { name } of tables) {
    const stored = await source.selectFrom(name).selectAll().execute();
    for (const { id, hlc, deleted, ...data } of stored) {
      if (
        typeof id !== "string" ||
        typeof hlc !== "string" ||
        !isValidHlc(hlc)
      ) {
        throw new InvalidSnapshotError(`invalid row in ${name}`);
      }
      const upgraded = upgradeRow(
        { table: name, id, data: data as RowData },
        meta.schemaVersion,
      );
      for (const row of upgraded) {
        if (!isSyncedTable(row.table)) continue;
        rows.push({
          table: row.table,
          id: row.id,
          hlc,
          deleted: deleted ? 1 : 0,
          data: pickColumns(row.table, row.data),
        });
      }
    }
  }
  return { meta, rows };
}

async function readMeta(source: UntypedKysely): Promise<SnapshotMeta> {
  let entries: Record<string, unknown>[];
  try {
    entries = await source
      .selectFrom("meta")
      .select(["key", "value"])
      .execute();
  } catch {
    throw new InvalidSnapshotError("not a workout logger snapshot");
  }
  const get = (key: string) =>
    entries.find((e) => e.key === key)?.value as string | undefined;
  const schemaVersion = Number(get("schema_version"));
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new InvalidSnapshotError("snapshot has no schema version");
  }
  return {
    schemaVersion,
    createdAt: Number(get("created_at") ?? 0),
    source: get("source") ?? "unknown",
    serverEpoch: get("server_epoch") ?? null,
  };
}

export interface ImportResult {
  /** Rows written. */
  written: number;
  /** Rows deleted because the snapshot doesn't have them (replace only). */
  deleted: number;
  /** For `Store.undo`; null when the import can't be undone (merge). */
  undoTx: number | null;
}

/**
 * Merge: applies the rows with the normal LWW rule, so newer local data
 * survives. Rows that win are queued for push, since the server may not have
 * them.
 */
export async function mergeSnapshot(
  store: Store,
  rows: readonly SnapshotRow[],
): Promise<ImportResult> {
  return store.transaction(async (trx, touched) => {
    let written = 0;
    let maxHlc = "";
    for (const row of rows) {
      if (row.hlc > maxHlc) maxHlc = row.hlc;
      const local = await readHlc(trx, row.table, row.id);
      if (local !== undefined && row.hlc <= local) continue;
      await upsertRow(trx, row.table, row.id, row.hlc, row.deleted, row.data);
      await enqueue(trx, row.table, row.id);
      await dropUndoFor(trx, row.table, row.id);
      touched.add(row.table).add("_outbox").add("_undo");
      written++;
    }
    if (maxHlc) {
      const clock = await TxClock.load(trx, store.deviceId, store.now);
      clock.observe(maxHlc);
      await clock.save(trx);
    }
    return { written, deleted: 0, undoTx: null };
  });
}

/**
 * Replace: makes the local data equal the snapshot by writing its rows with
 * fresh HLCs and deleting rows it doesn't have, so the result wins
 * everywhere once synced. Undoable as one transaction.
 */
export async function replaceWithSnapshot(
  store: Store,
  rows: readonly SnapshotRow[],
): Promise<ImportResult> {
  const { result, undoTx } = await store.writeUndoable(async (w) => {
    let written = 0;
    let deleted = 0;
    const kept = new Map<SyncedTableName, Set<string>>();
    for (const row of rows) {
      if (row.deleted) continue;
      const ids = kept.get(row.table) ?? new Set<string>();
      kept.set(row.table, ids.add(row.id));
      const local = await readRow(w.db, row.table, row.id);
      if (
        local &&
        !local.deleted &&
        JSON.stringify(local.data) === JSON.stringify(row.data)
      ) {
        continue;
      }
      await w.put(row.table, row.id, row.data as NewRow<typeof row.table>);
      written++;
    }
    for (const table of SYNCED_TABLES) {
      const live = await untyped(w.db)
        .selectFrom(table)
        .select("id")
        .where("deleted", "=", 0)
        .execute();
      for (const { id } of live) {
        if (kept.get(table)?.has(id as string)) continue;
        await w.delete(table, id as string);
        deleted++;
      }
    }
    return { written, deleted };
  });
  return { ...result, undoTx };
}
