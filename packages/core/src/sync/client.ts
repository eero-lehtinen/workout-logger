import { sql } from "kysely";
import { upgradeRow } from "../migrations/upgrade.ts";
import {
  isSyncedTable,
  SCHEMA_VERSION,
  SYNCED_TABLES,
  type SyncStateKey,
  type TableName,
} from "../schema/tables.ts";
import { TxClock } from "../store/clock.ts";
import { readHlc, readRow, type Trx, upsertRow } from "../store/rows.ts";
import type { Store } from "../store/store.ts";
import { dropUndoFor } from "../store/undo.ts";
import type {
  Change,
  PulledChange,
  PullResponse,
  PushResponse,
  RejectReason,
  SnapshotResponse,
} from "./protocol.ts";

export interface SyncState {
  epoch: string | null;
  /** Null until the first snapshot or pull: the device needs a bootstrap. */
  cursor: number | null;
}

export type ApplyOutcome =
  | { status: "applied"; applied: number }
  /** A change has a newer schema version: stop syncing and ask for an app update. */
  | { status: "update_required"; applied: number }
  /** The server was restored. Everything is queued for re-upload; sync again. */
  | { status: "epoch_changed" };

export async function readSyncState(store: Store): Promise<SyncState> {
  return readState(store.db);
}

/** Up to `limit` queued rows in their current state, in queue order. */
export async function collectPush(
  store: Store,
  limit = 500,
): Promise<Change[]> {
  return store.db.transaction().execute(async (trx) => {
    const queued = await trx
      .selectFrom("_outbox")
      .select(["table_name", "id"])
      .orderBy(sql`rowid`)
      .limit(limit)
      .execute();
    const changes: Change[] = [];
    for (const { table_name: table, id } of queued) {
      if (!isSyncedTable(table)) continue;
      const row = await readRow(trx, table, id);
      if (!row) continue;
      changes.push({
        table,
        id,
        hlc: row.hlc,
        deleted: row.deleted === 1,
        v: SCHEMA_VERSION,
        data: row.data,
      });
    }
    return changes;
  });
}

export interface PushAcknowledgement {
  acknowledged: number;
  rejected: { change: Change; reason: RejectReason }[];
}

/**
 * Removes acknowledged rows from the outbox, unless the row changed after it
 * was sent: then its new version goes in the next push. Rejected rows stay.
 */
export async function acknowledgePush(
  store: Store,
  sent: readonly Change[],
  response: PushResponse,
): Promise<PushAcknowledgement> {
  const { results } = response;
  if (results.length !== sent.length) {
    throw new Error(
      `got ${results.length} push results for ${sent.length} changes`,
    );
  }
  return store.transaction(async (trx, touched) => {
    // A device that pushes before its first pull must still remember the
    // epoch, or it can't notice a restore that loses these changes. A known
    // epoch is never replaced here: the next pull compares it and resets.
    if ((await readState(trx)).epoch === null) {
      await writeState(trx, "server_epoch", response.epoch);
    }
    const rejected: { change: Change; reason: RejectReason }[] = [];
    let acknowledged = 0;
    for (const [i, change] of sent.entries()) {
      const result = results[i];
      if (result?.status === "rejected") {
        rejected.push({ change, reason: result.reason });
        continue;
      }
      if (!isSyncedTable(change.table)) continue;
      if ((await readHlc(trx, change.table, change.id)) !== change.hlc)
        continue;
      await removeFromOutbox(trx, change.table, change.id);
      touched.add("_outbox");
      acknowledged++;
    }
    return { acknowledged, rejected };
  });
}

/** Applies one pull page and stores its cursor, in one transaction. */
export async function applyPull(
  store: Store,
  page: PullResponse,
): Promise<ApplyOutcome> {
  return store.transaction(async (trx, touched) => {
    const state = await readState(trx);
    if (state.epoch !== null && state.epoch !== page.epoch) {
      await resetForEpoch(trx, page.epoch, touched);
      return { status: "epoch_changed" };
    }
    const supported = supportedPrefix(page.changes);
    const applied = await applyChanges(store, trx, supported, touched);
    const stopped = supported.length < page.changes.length;
    // The cursor must not pass a change this version can't apply yet.
    const cursor = stopped
      ? (supported.at(-1)?.seq ?? state.cursor ?? 0)
      : page.cursor;
    await writeState(trx, "server_epoch", page.epoch);
    await writeState(trx, "cursor", String(cursor));
    return { status: stopped ? "update_required" : "applied", applied };
  });
}

/** Bootstraps a new device from the server's head rows. */
export async function applySnapshot(
  store: Store,
  snapshot: SnapshotResponse,
): Promise<ApplyOutcome> {
  if (snapshot.changes.some((c) => c.v > SCHEMA_VERSION)) {
    return { status: "update_required", applied: 0 };
  }
  return store.transaction(async (trx, touched) => {
    const { epoch } = await readState(trx);
    if (epoch !== null && epoch !== snapshot.epoch) {
      await resetForEpoch(trx, snapshot.epoch, touched);
      return { status: "epoch_changed" };
    }
    const applied = await applyChanges(store, trx, snapshot.changes, touched);
    await writeState(trx, "server_epoch", snapshot.epoch);
    await writeState(trx, "cursor", String(snapshot.cursor));
    return { status: "applied", applied };
  });
}

function supportedPrefix(changes: readonly PulledChange[]): PulledChange[] {
  const firstNewer = changes.findIndex((c) => c.v > SCHEMA_VERSION);
  return firstNewer === -1 ? [...changes] : changes.slice(0, firstNewer);
}

/**
 * LWW per row: a change wins if there is no local row or its HLC is greater.
 * A winning change drops the row's outbox entry, because the local edit lost.
 * Echoes of this device's own pushes and older versions are skipped.
 */
async function applyChanges(
  store: Store,
  trx: Trx,
  changes: readonly Change[],
  touched: Set<TableName>,
): Promise<number> {
  if (changes.length === 0) return 0;
  let applied = 0;
  let maxHlc = "";
  for (const change of changes) {
    if (change.hlc > maxHlc) maxHlc = change.hlc;
    const rows = upgradeRow(
      { table: change.table, id: change.id, data: change.data },
      change.v,
    );
    for (const row of rows) {
      if (!isSyncedTable(row.table)) continue;
      const local = await readHlc(trx, row.table, row.id);
      if (local !== undefined && change.hlc <= local) continue;
      await upsertRow(
        trx,
        row.table,
        row.id,
        change.hlc,
        change.deleted ? 1 : 0,
        row.data,
      );
      await removeFromOutbox(trx, row.table, row.id);
      await dropUndoFor(trx, row.table, row.id);
      touched.add(row.table).add("_outbox").add("_undo");
      applied++;
    }
  }
  const clock = await TxClock.load(trx, store.deviceId, store.now);
  clock.observe(maxHlc);
  await clock.save(trx);
  return applied;
}

/**
 * After a server restore: queue every local row for re-upload and pull the
 * whole log again. The server dedups what it still has.
 */
async function resetForEpoch(trx: Trx, epoch: string, touched: Set<TableName>) {
  for (const table of SYNCED_TABLES) {
    await trx
      .insertInto("_outbox")
      .orIgnore()
      .columns(["table_name", "id"])
      .expression((eb) =>
        eb.selectFrom(table).select([sql.lit(table).as("table_name"), "id"]),
      )
      .execute();
  }
  await writeState(trx, "server_epoch", epoch);
  await writeState(trx, "cursor", "0");
  touched.add("_outbox");
}

async function removeFromOutbox(trx: Trx, table: string, id: string) {
  await trx
    .deleteFrom("_outbox")
    .where("table_name", "=", table)
    .where("id", "=", id)
    .execute();
}

async function readState(db: Store["db"]): Promise<SyncState> {
  const rows = await db
    .selectFrom("_sync_state")
    .select(["key", "value"])
    .where("key", "in", ["server_epoch", "cursor"])
    .execute();
  const get = (key: SyncStateKey) => rows.find((r) => r.key === key)?.value;
  const cursor = get("cursor");
  return {
    epoch: get("server_epoch") ?? null,
    cursor: cursor === undefined ? null : Number(cursor),
  };
}

async function writeState(trx: Trx, key: SyncStateKey, value: string) {
  await trx
    .insertInto("_sync_state")
    .values({ key, value })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value }))
    .execute();
}
