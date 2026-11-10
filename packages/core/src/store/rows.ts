import type { Kysely, Transaction } from "kysely";
import type { RowData, UntypedKysely } from "../migrations/types.ts";
import {
  type Database,
  type Flag,
  SYNCED_COLUMNS,
  type SyncedTableName,
} from "../schema/tables.ts";

export type Trx = Transaction<Database>;

/** For queries on a table chosen at runtime. */
export function untyped(db: Kysely<Database>): UntypedKysely {
  return db as unknown as UntypedKysely;
}

export interface StoredRow {
  hlc: string;
  deleted: Flag;
  data: RowData;
}

export async function readRow(
  trx: Trx,
  table: SyncedTableName,
  id: string,
): Promise<StoredRow | undefined> {
  const row = await untyped(trx)
    .selectFrom(table)
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    hlc: row.hlc as string,
    deleted: row.deleted as Flag,
    data: pickColumns(table, row),
  };
}

export async function readHlc(
  trx: Trx,
  table: SyncedTableName,
  id: string,
): Promise<string | undefined> {
  const row = await untyped(trx)
    .selectFrom(table)
    .select("hlc")
    .where("id", "=", id)
    .executeTakeFirst();
  return row?.hlc as string | undefined;
}

/** The table's current domain columns; missing ones become null. */
export function pickColumns(table: SyncedTableName, source: RowData): RowData {
  const data: RowData = {};
  for (const column of SYNCED_COLUMNS[table] as readonly string[]) {
    data[column] = source[column] ?? null;
  }
  return data;
}

export async function upsertRow(
  trx: Trx,
  table: SyncedTableName,
  id: string,
  hlc: string,
  deleted: Flag,
  data: RowData,
) {
  const values = { ...pickColumns(table, data), hlc, deleted };
  await untyped(trx)
    .insertInto(table)
    .values({ ...values, id })
    .onConflict((oc) => oc.column("id").doUpdateSet(values))
    .execute();
}

export async function enqueue(trx: Trx, table: SyncedTableName, id: string) {
  await trx
    .insertInto("_outbox")
    .values({ table_name: table, id })
    .onConflict((oc) => oc.doNothing())
    .execute();
}
