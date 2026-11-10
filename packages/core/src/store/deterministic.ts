import type { DomainRow, SyncedTableName } from "../schema/tables.ts";
import { isValidHlc } from "../sync/hlc.ts";
import { enqueue, readHlc, upsertRow } from "./rows.ts";
import type { Store } from "./store.ts";

/**
 * A row whose id and HLC derive from its source (the built-in catalog, a
 * Health Connect record, a FitNotes row), so every device writes identical
 * changes. See docs/sync.md#deterministic-writes.
 */
export type DeterministicRow = {
  [T in SyncedTableName]: {
    table: T;
    id: string;
    /** Usually from `deterministicHlc`. */
    hlc: string;
    deleted?: boolean;
    data: DomainRow<T>;
  };
}[SyncedTableName];

/**
 * Writes rows with their given HLCs, skipping each row whose local HLC is
 * greater or equal. A user's edit or delete is always newer, so it survives
 * re-seeding and re-imports. Not undoable.
 */
export async function writeDeterministic(
  store: Store,
  rows: readonly DeterministicRow[],
): Promise<{ written: number; skipped: number }> {
  return store.transaction(async (trx, touched) => {
    let written = 0;
    for (const row of rows) {
      if (!isValidHlc(row.hlc)) throw new Error(`invalid HLC: ${row.hlc}`);
      const local = await readHlc(trx, row.table, row.id);
      if (local !== undefined && local >= row.hlc) continue;
      await upsertRow(
        trx,
        row.table,
        row.id,
        row.hlc,
        row.deleted ? 1 : 0,
        row.data,
      );
      await enqueue(trx, row.table, row.id);
      touched.add(row.table).add("_outbox");
      written++;
    }
    return { written, skipped: rows.length - written };
  });
}
