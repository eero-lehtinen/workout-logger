import { sql } from "kysely";
import {
  compareOrder,
  type Ordered,
  positionBetween,
  positionsBetween,
} from "../domain/position.ts";
import type { SyncedTableName } from "../schema/tables.ts";
import { untyped } from "../store/rows.ts";
import type { Writer } from "../store/write.ts";

type OrderedTable = Extract<
  SyncedTableName,
  | "routine"
  | "routine_day"
  | "slot"
  | "slot_alternative"
  | "session_exercise"
  | "set_log"
>;

/**
 * A position after every sibling, deleted ones included, so reviving a
 * deleted sibling can't tie with the new row.
 */
export async function appendPosition(
  w: Writer,
  table: OrderedTable,
  parentColumn: string | null,
  parentId: string | null,
): Promise<string> {
  let query = untyped(w.db)
    .selectFrom(table)
    .select(sql<string | null>`max(position)`.as("last"));
  if (parentColumn) query = query.where(parentColumn, "=", parentId);
  const row = await query.executeTakeFirst();
  return positionBetween((row?.last as string | null) ?? null, null);
}

/** Live siblings in display order. */
export async function liveSiblings(
  w: Writer,
  table: OrderedTable,
  parentColumn: string | null,
  parentId: string | null,
): Promise<Ordered[]> {
  let query = untyped(w.db)
    .selectFrom(table)
    .select(["id", "position"])
    .where("deleted", "=", 0);
  if (parentColumn) query = query.where(parentColumn, "=", parentId);
  const rows = (await query.execute()) as unknown as Ordered[];
  return rows.sort(compareOrder);
}

/**
 * Moves `id` to index `toIndex` among its live siblings, e.g. where it was
 * dropped. Only the moved row is written, unless equal positions from
 * concurrent inserts leave no key between its new neighbors: the siblings
 * are then renumbered.
 */
export async function moveInList(
  w: Writer,
  table: OrderedTable,
  siblings: readonly Ordered[],
  id: string,
  toIndex: number,
): Promise<void> {
  const from = siblings.findIndex((s) => s.id === id);
  const to = Math.min(Math.max(Math.trunc(toIndex), 0), siblings.length - 1);
  if (from === -1 || from === to) return;
  const order = [...siblings];
  const [moved] = order.splice(from, 1);
  if (!moved) return;
  order.splice(to, 0, moved);

  const before = order[to - 1]?.position ?? null;
  const after = order[to + 1]?.position ?? null;
  if (before === null || after === null || before < after) {
    await w.update(table, id, { position: positionBetween(before, after) });
    return;
  }
  const positions = positionsBetween(null, null, order.length);
  for (const [i, sibling] of order.entries()) {
    const position = positions[i];
    if (position && position !== sibling.position) {
      await w.update(table, sibling.id, { position });
    }
  }
}
