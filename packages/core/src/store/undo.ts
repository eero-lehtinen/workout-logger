import type { RowData } from "../migrations/types.ts";
import { type Flag, isSyncedTable } from "../schema/tables.ts";
import { TxClock } from "./clock.ts";
import { enqueue, readRow, type Trx, upsertRow } from "./rows.ts";
import type { Store } from "./store.ts";

/**
 * Writes back the previous versions recorded by the latest undoable write
 * transaction, as new changes with fresh HLCs, so the undo syncs like any edit.
 * A row the transaction created is soft-deleted.
 */
export async function undoLast(store: Store): Promise<boolean> {
  return store.transaction(async (trx, touched) => {
    const latest = await trx
      .selectFrom("_undo")
      .select((eb) => eb.fn.max("tx").as("tx"))
      .executeTakeFirst();
    const tx = latest?.tx;
    if (tx == null) return false;

    const entries = await trx
      .selectFrom("_undo")
      .selectAll()
      .where("tx", "=", tx)
      .orderBy("seq", "desc")
      .execute();
    const clock = await TxClock.load(trx, store.deviceId, store.now);
    for (const entry of entries) {
      const table = entry.table_name;
      if (!isSyncedTable(table)) continue;
      const current = await readRow(trx, table, entry.id);
      let target: { deleted: Flag; data: RowData };
      if (entry.previous) {
        target = JSON.parse(entry.previous);
      } else if (current && !current.deleted) {
        target = { deleted: 1, data: current.data };
      } else {
        continue;
      }
      const hlc = clock.stamp(current?.hlc);
      await upsertRow(trx, table, entry.id, hlc, target.deleted, target.data);
      await enqueue(trx, table, entry.id);
      touched.add(table).add("_outbox");
    }
    await clock.save(trx);
    await trx.deleteFrom("_undo").where("tx", "=", tx).execute();
    touched.add("_undo");
    return true;
  });
}

/**
 * Forgets undo entries of every transaction that touched a row, once another
 * device's version of that row has won: undoing them would overwrite it.
 */
export async function dropUndoFor(trx: Trx, table: string, id: string) {
  await trx
    .deleteFrom("_undo")
    .where(
      "tx",
      "in",
      trx
        .selectFrom("_undo")
        .select("tx")
        .where("table_name", "=", table)
        .where("id", "=", id),
    )
    .execute();
}
