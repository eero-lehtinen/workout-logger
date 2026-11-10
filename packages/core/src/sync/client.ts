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
import { readSyncValue, writeSyncState } from "./local-state.ts";
import {
  type Change,
  MAX_PUSH_BYTES,
  type PulledChange,
  type PullResponse,
  type PushResponse,
  type RejectReason,
  type SnapshotResponse,
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

/**
 * What a sync run expects of the device when it writes. Another run, or an
 * account change between a request and its response, makes the write throw
 * `SyncInterrupted` instead of mixing two runs' or two accounts' state.
 */
export interface RunExpectation {
  /** The account the run syncs. Unchecked when undefined. */
  userId?: string | undefined;
  /**
   * The cursor the page was requested from, null for a snapshot. Unchecked
   * when undefined.
   */
  cursor?: number | null | undefined;
}

export class SyncInterrupted extends Error {
  constructor(reason: string) {
    super(`sync interrupted: ${reason}`);
    this.name = "SyncInterrupted";
  }
}

async function checkExpectation(
  trx: Trx,
  state: SyncState,
  expected: RunExpectation,
) {
  if (
    expected.userId !== undefined &&
    (await readSyncValue(trx, "user_id")) !== expected.userId
  ) {
    throw new SyncInterrupted("the device's account changed");
  }
  if (expected.cursor !== undefined && state.cursor !== expected.cursor) {
    throw new SyncInterrupted("another run moved the cursor");
  }
}

/** Under the server's body limit, with room for the envelope. */
export const PUSH_BUDGET_BYTES = MAX_PUSH_BYTES - 4096;

export interface PushBatch {
  changes: Change[];
  /**
   * Entries skipped because one alone is over `PUSH_BUDGET_BYTES`. They stay
   * queued, ahead of `changes`, so they count toward the next offset.
   */
  tooLarge: number;
}

const encoder = new TextEncoder();

/**
 * Queued rows in their current state, in queue order, after skipping the
 * first `offset`: entries a push in the same run left queued. At most `limit`
 * rows and `maxBytes` of JSON. Drops entries that have nothing to send: a
 * table this version doesn't sync, or a row that no longer exists.
 */
export async function collectPush(
  store: Store,
  limit = 500,
  offset = 0,
  maxBytes = PUSH_BUDGET_BYTES,
): Promise<PushBatch> {
  return store.db.transaction().execute(async (trx) => {
    const queued = await trx
      .selectFrom("_outbox")
      .select(["table_name", "id"])
      .orderBy(sql`rowid`)
      .limit(limit)
      .offset(offset)
      .execute();
    const changes: Change[] = [];
    let tooLarge = 0;
    let bytes = 0;
    for (const { table_name: table, id } of queued) {
      const row = isSyncedTable(table)
        ? await readRow(trx, table, id)
        : undefined;
      if (!isSyncedTable(table) || !row) {
        await removeFromOutbox(trx, table, id);
        continue;
      }
      const change: Change = {
        table,
        id,
        hlc: row.hlc,
        deleted: row.deleted === 1,
        v: SCHEMA_VERSION,
        data: row.data,
      };
      const size = encoder.encode(JSON.stringify(change)).length + 1;
      if (size > maxBytes) {
        // Skipped only ahead of the batch, so the skipped entries stay
        // contiguous before it and the caller's offset stays exact.
        if (changes.length > 0) break;
        tooLarge++;
        continue;
      }
      if (bytes + size > maxBytes) break;
      bytes += size;
      changes.push(change);
    }
    return { changes, tooLarge };
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
  expected: RunExpectation = {},
): Promise<PushAcknowledgement> {
  const { results } = response;
  if (results.length !== sent.length) {
    throw new Error(
      `got ${results.length} push results for ${sent.length} changes`,
    );
  }
  return store.transaction(async (trx, touched) => {
    const state = await readState(trx);
    // Only the account: a pull may move the cursor during a push.
    await checkExpectation(trx, state, { userId: expected.userId });
    // A device that pushes before its first pull must still remember the
    // epoch, or it can't notice a restore that loses these changes. A known
    // epoch is never replaced here: the next pull compares it and resets.
    if (state.epoch === null) {
      await writeSyncState(trx, "server_epoch", response.epoch);
    }
    const rejected: { change: Change; reason: RejectReason }[] = [];
    let acknowledged = 0;
    let maxAccepted = "";
    for (const [i, change] of sent.entries()) {
      const result = results[i];
      if (result?.status === "rejected") {
        rejected.push({ change, reason: result.reason });
        continue;
      }
      if (change.hlc > maxAccepted) maxAccepted = change.hlc;
      if (!isSyncedTable(change.table)) continue;
      if ((await readHlc(trx, change.table, change.id)) !== change.hlc)
        continue;
      await removeFromOutbox(trx, change.table, change.id);
      touched.add("_outbox");
      acknowledged++;
    }
    await raiseAcceptedHlc(trx, maxAccepted);
    return { acknowledged, rejected };
  });
}

/**
 * Records the newest HLC the server is known to have accepted, pushed or
 * pulled. `repairClock` never stamps below it.
 */
async function raiseAcceptedHlc(trx: Trx, hlc: string) {
  if (hlc === "") return;
  const current = await readSyncValue(trx, "accepted_hlc");
  if (current === null || hlc > current) {
    await writeSyncState(trx, "accepted_hlc", hlc);
  }
}

/** Applies one pull page and stores its cursor, in one transaction. */
export async function applyPull(
  store: Store,
  page: PullResponse,
  expected: RunExpectation = {},
): Promise<ApplyOutcome> {
  return store.transaction(async (trx, touched) => {
    const state = await readState(trx);
    await checkExpectation(trx, state, expected);
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
    await writeSyncState(trx, "server_epoch", page.epoch);
    await writeSyncState(trx, "cursor", String(cursor));
    return { status: stopped ? "update_required" : "applied", applied };
  });
}

/** Bootstraps a new device from the server's head rows. */
export async function applySnapshot(
  store: Store,
  snapshot: SnapshotResponse,
  expected: RunExpectation = {},
): Promise<ApplyOutcome> {
  if (snapshot.changes.some((c) => c.v > SCHEMA_VERSION)) {
    return { status: "update_required", applied: 0 };
  }
  return store.transaction(async (trx, touched) => {
    const state = await readState(trx);
    await checkExpectation(trx, state, expected);
    const { epoch } = state;
    if (epoch !== null && epoch !== snapshot.epoch) {
      await resetForEpoch(trx, snapshot.epoch, touched);
      return { status: "epoch_changed" };
    }
    const applied = await applyChanges(store, trx, snapshot.changes, touched);
    await writeSyncState(trx, "server_epoch", snapshot.epoch);
    await writeSyncState(trx, "cursor", String(snapshot.cursor));
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
  await raiseAcceptedHlc(trx, maxHlc);
  return applied;
}

/**
 * After a server restore: queue every local row for re-upload and pull the
 * whole log again. The server dedups what it still has.
 */
async function resetForEpoch(trx: Trx, epoch: string, touched: Set<TableName>) {
  await queueEveryRow(trx);
  await writeSyncState(trx, "server_epoch", epoch);
  await writeSyncState(trx, "cursor", "0");
  touched.add("_outbox");
}

/** Queues every local row for upload, e.g. to re-upload everything. */
export async function queueEveryRow(trx: Trx) {
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
