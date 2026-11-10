import type { Kysely } from "kysely";
import type { Database, SyncStateKey } from "../schema/tables.ts";

/** Reads and writes `_sync_state`, the device-local key-value table. */

export async function readSyncValue(
  db: Kysely<Database>,
  key: SyncStateKey,
): Promise<string | null> {
  const row = await db
    .selectFrom("_sync_state")
    .select("value")
    .where("key", "=", key)
    .executeTakeFirst();
  return row?.value ?? null;
}

export async function writeSyncState(
  db: Kysely<Database>,
  key: SyncStateKey,
  value: string,
) {
  await db
    .insertInto("_sync_state")
    .values({ key, value })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value }))
    .execute();
}

export async function deleteSyncState(
  db: Kysely<Database>,
  keys: readonly SyncStateKey[],
) {
  await db.deleteFrom("_sync_state").where("key", "in", keys).execute();
}
