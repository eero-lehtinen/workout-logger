import type { Store } from "../store/store.ts";
import {
  acknowledgePush,
  applyPull,
  applySnapshot,
  collectPush,
  readSyncState,
} from "./client.ts";
import { writeSyncState } from "./local-state.ts";
import type {
  PullResponse,
  PushRequest,
  PushResponse,
  RejectReason,
  SnapshotResponse,
} from "./protocol.ts";

/** How a device reaches `/api/sync/v1`. */
export interface SyncTransport {
  push(request: PushRequest): Promise<PushResponse>;
  pull(after: number, limit: number): Promise<PullResponse>;
  snapshot(): Promise<SnapshotResponse>;
}

export interface SyncOptions {
  clientVersion: string;
  /**
   * The account the run syncs. If the device's account changes mid-run, the
   * run throws `SyncInterrupted` instead of writing.
   */
  userId?: string;
  pushBatch?: number;
  pullLimit?: number;
  pushBytes?: number;
}

/** Why a change stays in the outbox: the server's reason, or too large to send. */
export type HeldReason = RejectReason | "too_large";

export interface SyncReport {
  /**
   * `update_required`: the server has rows from a newer app, or refuses this
   * app's rows as outdated. Local use goes on; sync waits for an update.
   */
  status: "ok" | "update_required";
  pushed: number;
  pulled: number;
  /** Changes left in the outbox, by reason. */
  rejected: Partial<Record<HeldReason, number>>;
}

// An epoch reset queues everything and pulls from 0, which is one more round.
// A second reset within one run means the server is being restored right now.
const MAX_ROUNDS = 3;

/**
 * One sync run: push the outbox, then pull until up to date. See
 * docs/sync.md#push and #pull. Transport errors propagate; whatever was
 * applied before them stays applied.
 */
export async function syncOnce(
  store: Store,
  transport: SyncTransport,
  options: SyncOptions,
): Promise<SyncReport> {
  const report: SyncReport = {
    status: "ok",
    pushed: 0,
    pulled: 0,
    rejected: {},
  };
  for (let round = 0; round < MAX_ROUNDS; round++) {
    report.rejected = {};
    await pushAll(store, transport, options, report);
    const outcome = await pullAll(store, transport, options, report);
    if (outcome === "epoch_changed") continue;
    if (outcome === "update_required" || report.rejected.schema_outdated) {
      report.status = "update_required";
    }
    await store.transaction(async (trx, touched) => {
      await writeSyncState(trx, "last_sync_at", String(store.now()));
      touched.add("_sync_state");
    });
    return report;
  }
  throw new Error("the server epoch changed during sync");
}

async function pushAll(
  store: Store,
  transport: SyncTransport,
  options: SyncOptions,
  report: SyncReport,
) {
  const batchSize = options.pushBatch ?? 500;
  // Rejected and oversized entries stay queued at the front; skip past them.
  let offset = 0;
  for (;;) {
    const { changes, tooLarge } = await collectPush(
      store,
      batchSize,
      offset,
      options.pushBytes,
    );
    if (tooLarge > 0) {
      report.rejected.too_large = (report.rejected.too_large ?? 0) + tooLarge;
      offset += tooLarge;
    }
    if (changes.length === 0) {
      if (tooLarge > 0) continue;
      return;
    }
    const response = await transport.push({
      device_id: store.deviceId,
      client_version: options.clientVersion,
      changes,
    });
    const { acknowledged, rejected } = await acknowledgePush(
      store,
      changes,
      response,
      { userId: options.userId },
    );
    report.pushed += acknowledged;
    offset += changes.length - acknowledged;
    for (const { reason } of rejected) {
      report.rejected[reason] = (report.rejected[reason] ?? 0) + 1;
    }
    if (report.rejected.quota) return;
  }
}

async function pullAll(
  store: Store,
  transport: SyncTransport,
  options: SyncOptions,
  report: SyncReport,
): Promise<"done" | "update_required" | "epoch_changed"> {
  const limit = options.pullLimit ?? 1000;
  const { userId } = options;
  let { cursor } = await readSyncState(store);
  if (cursor === null) {
    const snapshot = await transport.snapshot();
    const outcome = await applySnapshot(store, snapshot, {
      userId,
      cursor: null,
    });
    if (outcome.status !== "applied") return outcome.status;
    report.pulled += outcome.applied;
    cursor = snapshot.cursor;
  }
  for (;;) {
    const page = await transport.pull(cursor, limit);
    const outcome = await applyPull(store, page, { userId, cursor });
    if (outcome.status === "epoch_changed") return outcome.status;
    report.pulled += outcome.applied;
    if (outcome.status === "update_required") return outcome.status;
    if (!page.more) return "done";
    cursor = page.cursor;
  }
}
