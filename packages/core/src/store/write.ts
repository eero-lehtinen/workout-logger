import type { RowData } from "../migrations/types.ts";
import type {
  DomainRow,
  Flag,
  NewRow,
  SyncedTableName,
} from "../schema/tables.ts";
import { newId } from "../sync/ids.ts";
import { TxClock } from "./clock.ts";
import {
  enqueue,
  readRow,
  type StoredRow,
  type Trx,
  upsertRow,
} from "./rows.ts";
import type { Store } from "./store.ts";

/** Undo keeps this many recent write transactions. */
export const UNDO_DEPTH = 20;

export interface WriteOptions {
  /** Record previous row versions so `Store.undo` can revert this write. Default true. */
  undoable?: boolean;
}

/**
 * The only way feature code changes synced tables. Each write stamps the row's
 * HLC, queues it for sync, and records the previous version for undo, all in
 * the surrounding transaction.
 */
export interface Writer {
  /** For reads inside the transaction. Never write synced tables through it. */
  readonly db: Trx;
  /** Creates a row and returns its id, a new UUIDv7 unless given. */
  insert<T extends SyncedTableName>(
    table: T,
    row: NewRow<T> & { id?: string },
  ): Promise<string>;
  /** Changes some columns of an existing row. */
  update<T extends SyncedTableName>(
    table: T,
    id: string,
    patch: Partial<DomainRow<T>>,
  ): Promise<void>;
  /** Creates or fully replaces (and undeletes) a row with a known id, e.g. a setting. */
  put<T extends SyncedTableName>(
    table: T,
    id: string,
    row: NewRow<T>,
  ): Promise<void>;
  /** Soft-deletes a row. Children are untouched: queries hide them. */
  delete(table: SyncedTableName, id: string): Promise<void>;
}

export interface WriteResult<T> {
  result: T;
  /** The undo transaction this write recorded, for `Store.undo(tx)`; null if nothing was recorded. */
  undoTx: number | null;
}

export async function writeTransaction<T>(
  store: Store,
  fn: (w: Writer) => Promise<T>,
  options: WriteOptions = {},
): Promise<WriteResult<T>> {
  const undoable = options.undoable ?? true;
  return store.transaction(async (trx, touched) => {
    const clock = await TxClock.load(trx, store.deviceId, store.now);
    let undoTx: number | undefined;
    const recorded = new Set<string>();

    async function recordUndo(
      table: SyncedTableName,
      id: string,
      previous: StoredRow | undefined,
    ) {
      const key = `${table}\u0000${id}`;
      if (!undoable || recorded.has(key)) return;
      recorded.add(key);
      undoTx ??= await nextUndoTx(trx);
      await trx
        .insertInto("_undo")
        .values({
          tx: undoTx,
          table_name: table,
          id,
          previous: previous
            ? JSON.stringify({ deleted: previous.deleted, data: previous.data })
            : null,
        })
        .execute();
      touched.add("_undo");
    }

    async function write(
      table: SyncedTableName,
      id: string,
      deleted: Flag,
      data: RowData,
      current: StoredRow | undefined,
    ) {
      await recordUndo(table, id, current);
      await upsertRow(trx, table, id, clock.stamp(current?.hlc), deleted, data);
      await enqueue(trx, table, id);
      touched.add(table).add("_outbox");
    }

    async function existing(table: SyncedTableName, id: string) {
      const row = await readRow(trx, table, id);
      if (!row) throw new Error(`${table} ${id} not found`);
      return row;
    }

    const writer: Writer = {
      db: trx,
      async insert(table, { id = newId(), ...row }) {
        if (await readRow(trx, table, id)) {
          throw new Error(`${table} ${id} already exists`);
        }
        await write(table, id, 0, row, undefined);
        return id;
      },
      async update(table, id, patch) {
        const current = await existing(table, id);
        await write(
          table,
          id,
          current.deleted,
          { ...current.data, ...patch },
          current,
        );
      },
      async put(table, id, row) {
        await write(table, id, 0, row, await readRow(trx, table, id));
      },
      async delete(table, id) {
        const current = await existing(table, id);
        if (current.deleted) return;
        await write(table, id, 1, current.data, current);
      },
    };

    const result = await fn(writer);
    await clock.save(trx);
    if (undoTx !== undefined) {
      await trx
        .deleteFrom("_undo")
        .where("tx", "<=", undoTx - UNDO_DEPTH)
        .execute();
    }
    return { result, undoTx: undoTx ?? null };
  });
}

async function nextUndoTx(trx: Trx): Promise<number> {
  const row = await trx
    .selectFrom("_undo")
    .select((eb) => eb.fn.max("tx").as("tx"))
    .executeTakeFirst();
  return (row?.tx ?? 0) + 1;
}
