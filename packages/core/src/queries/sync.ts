import { readSyncValue } from "../sync/local-state.ts";
import { defineQuery } from "./define.ts";

export interface SyncStatus {
  /** Rows written here that the server hasn't acknowledged. */
  unsynced: number;
  lastSyncAt: number | null;
  /** The account this device syncs with, kept after logout. */
  userId: string | null;
}

export const syncStatus = defineQuery(
  ["_outbox", "_sync_state"],
  async (db): Promise<SyncStatus> => {
    const { count } = await db
      .selectFrom("_outbox")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();
    const lastSyncAt = await readSyncValue(db, "last_sync_at");
    return {
      unsynced: Number(count),
      lastSyncAt: lastSyncAt === null ? null : Number(lastSyncAt),
      userId: await readSyncValue(db, "user_id"),
    };
  },
);
