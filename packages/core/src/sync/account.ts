import { sql } from "kysely";
import { isSyncedTable, SYNCED_TABLES } from "../schema/tables.ts";
import { TxClock } from "../store/clock.ts";
import { readHlc, untyped } from "../store/rows.ts";
import type { Store } from "../store/store.ts";
import { queueEveryRow } from "./client.ts";
import { FUTURE_CLOCK_LIMIT_MS, formatHlc } from "./hlc.ts";
import {
  deleteSyncState,
  readSyncValue,
  writeSyncState,
} from "./local-state.ts";

/**
 * How a signed-in account relates to this device's data:
 * - `same`: the account the device last synced with;
 * - `first`: the device never synced, so its data simply uploads;
 * - `other`: the device holds another account's data. The user chooses
 *   between `merge` and `discard` (docs/accounts.md#without-an-account).
 */
export type AccountMatch = "same" | "first" | "other";

export async function matchAccount(
  store: Store,
  userId: string,
): Promise<AccountMatch> {
  const current = await readSyncValue(store.db, "user_id");
  if (current === null) return "first";
  return current === userId ? "same" : "other";
}

/**
 * Binds the device to `userId`.
 * - `keep`: for `same` and `first`; the outbox already holds every unsynced row.
 * - `merge`: queues every local row for upload into the new account and
 *   bootstraps from its snapshot. LWW merges the two.
 * - `discard`: empties the synced tables and the local queues, so the device
 *   starts like a fresh install. The caller re-seeds the catalog.
 */
export async function adoptAccount(
  store: Store,
  userId: string,
  mode: "keep" | "merge" | "discard",
): Promise<void> {
  await store.transaction(async (trx, touched) => {
    if (mode === "merge") {
      await queueEveryRow(trx);
      touched.add("_outbox");
    }
    if (mode === "discard") {
      // The one place rows of synced tables are removed on a device. Nothing
      // is pushed for them: they belong to the other account, which keeps
      // its copy on the server.
      for (const table of SYNCED_TABLES) {
        await untyped(trx).deleteFrom(table).execute();
        touched.add(table);
      }
      await trx.deleteFrom("_outbox").execute();
      await trx.deleteFrom("_undo").execute();
      touched.add("_outbox").add("_undo");
    }
    if (mode !== "keep") {
      await deleteSyncState(trx, ["server_epoch", "cursor", "last_sync_at"]);
    }
    await writeSyncState(trx, "user_id", userId);
    touched.add("_sync_state");
  });
}

/** Keeps a repaired change under the server's limit despite a slow push or a little skew. */
const REPAIR_MARGIN_MS = 5 * 60 * 1000;

/**
 * "Repair clock" after the server rejected changes as `future_clock`
 * (docs/sync.md#hlc), once the device's clock is right again. Pulls the clock
 * back to just under the server's limit, `now + FUTURE_CLOCK_LIMIT_MS -
 * REPAIR_MARGIN_MS`, or to the newest HLC the server is known to have
 * accepted if that is higher, and re-stamps the queued rows above it.
 *
 * Not back to `now`: a re-stamped edit must still beat the version it
 * replaced, which the device no longer has. Every version the server accepted
 * had a wall at most `FUTURE_CLOCK_LIMIT_MS` ahead of the server, so the
 * ceiling beats all of them except ones written within the margin of that
 * limit; `accepted_hlc` covers those this device pushed or pulled.
 * Returns the number of rows re-stamped.
 */
export async function repairClock(store: Store): Promise<number> {
  return store.transaction(async (trx, touched) => {
    const ceiling = formatHlc({
      wall: store.now() + FUTURE_CLOCK_LIMIT_MS - REPAIR_MARGIN_MS,
      counter: 0,
      node: store.deviceId,
    });
    const accepted = await readSyncValue(trx, "accepted_hlc");
    const floor = accepted !== null && accepted > ceiling ? accepted : ceiling;
    const last = await readSyncValue(trx, "last_hlc");
    if (last === null || last <= floor) return 0;
    await writeSyncState(trx, "last_hlc", floor);
    touched.add("_sync_state");
    const clock = await TxClock.load(trx, store.deviceId, store.now);
    const queued = await trx
      .selectFrom("_outbox")
      .select(["table_name", "id"])
      .orderBy(sql`rowid`)
      .execute();
    let restamped = 0;
    for (const { table_name: table, id } of queued) {
      if (!isSyncedTable(table)) continue;
      const hlc = await readHlc(trx, table, id);
      if (hlc === undefined || hlc <= floor) continue;
      await untyped(trx)
        .updateTable(table)
        .set({ hlc: clock.stamp() })
        .where("id", "=", id)
        .execute();
      touched.add(table);
      restamped++;
    }
    await clock.save(trx);
    return restamped;
  });
}
