import type { Kysely, Selectable, Transaction } from "kysely";
import { FUTURE_CLOCK_LIMIT_MS, isValidHlc, parseHlc } from "../hlc.ts";
import type {
  Change,
  PulledChange,
  PullResponse,
  PushRequest,
  PushResponse,
  PushResult,
  SnapshotResponse,
} from "../protocol.ts";
import type { HeadTable, ServerSyncTables } from "./schema.ts";

// The server keeps the newest version of each row and orders them by `seq`;
// it never interprets `data`. Every function takes the authenticated user's
// id and every query filters by it.

export type ServerDb = Kysely<ServerSyncTables>;
export type ServerTrx = Transaction<ServerSyncTables>;

export { FUTURE_CLOCK_LIMIT_MS };
export const MAX_PULL_LIMIT = 1000;

const TABLE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const ID_PATTERN = /^[0-9A-Za-z_.:-]{1,128}$/;

/** Room left for one push, in `rowBytes`. */
export interface QuotaAllowance {
  /** Size of the versions it may store; infinite without a daily limit. */
  written: number;
  /**
   * How much the user's stored `data` may grow. A replaced row counts its
   * new size less its old one.
   */
  stored: number;
}

/**
 * The server's quota for one user, read before the first change and recorded
 * after the last, inside the push transaction, so two devices of one user
 * can't overrun it together (docs/accounts.md#quotas).
 */
export interface PushQuota {
  allowance(trx: ServerTrx): Promise<QuotaAllowance>;
  /** Called once with the bytes the push stored, if any. */
  record(trx: ServerTrx, written: number): Promise<void>;
}

export interface PushOptions {
  /** Server time, epoch ms. */
  now: number;
  /** Without one there is no limit. */
  quota?: PushQuota;
}

interface PushState {
  maxV: number;
  inserted: number;
  allowance: QuotaAllowance;
  written: number;
  grown: number;
  /** Once a version doesn't fit, the rest of the push is refused too. */
  quotaReached: boolean;
  /** The last `seq` handed out, read from `server_meta`. */
  seq: number;
}

const UNLIMITED: QuotaAllowance = {
  written: Number.POSITIVE_INFINITY,
  stored: Number.POSITIVE_INFINITY,
};

const utf8 = new TextEncoder();

/** The UTF-8 size of a stored `data` string. */
export function dataBytes(data: string): number {
  return utf8.encode(data).length;
}

/**
 * The fixed part of a row's cost: the HLC, device id, `seq`, and the
 * `head_user_seq` index entry. Without it a row with empty `data` and a long
 * key would cost almost nothing, and a user could fill the disk with them.
 */
export const ROW_OVERHEAD_BYTES = 200;

/**
 * What a quota counts for a stored row: about its size in the database.
 * `table` and `id` are ASCII (`TABLE_PATTERN`, `ID_PATTERN`).
 */
export function rowBytes(table: string, id: string, data: string): number {
  return dataBytes(data) + table.length + id.length + ROW_OVERHEAD_BYTES;
}

/** Stores a batch of changes in one transaction. Results are in request order. */
export async function push(
  db: ServerDb,
  userId: string,
  request: PushRequest,
  options: PushOptions,
): Promise<PushResponse & { inserted: number }> {
  return db.transaction().execute(async (trx) => {
    const userSync = await trx
      .selectFrom("user_sync")
      .select("max_v")
      .where("user_id", "=", userId)
      .executeTakeFirst();
    const lastSeq = await readMeta(trx, "seq");
    const state: PushState = {
      maxV: userSync?.max_v ?? 0,
      inserted: 0,
      allowance: (await options.quota?.allowance(trx)) ?? UNLIMITED,
      written: 0,
      grown: 0,
      quotaReached: false,
      seq: Number(lastSeq),
    };
    const results: PushResult[] = [];
    for (const change of request.changes) {
      results.push(
        await pushOne(
          trx,
          userId,
          request.device_id,
          change,
          options.now,
          state,
        ),
      );
    }
    if (state.maxV > (userSync?.max_v ?? 0)) {
      await trx
        .insertInto("user_sync")
        .values({ user_id: userId, max_v: state.maxV })
        .onConflict((oc) =>
          oc.column("user_id").doUpdateSet({ max_v: state.maxV }),
        )
        .execute();
    }
    if (state.seq !== Number(lastSeq)) {
      await trx
        .updateTable("server_meta")
        .set({ value: String(state.seq) })
        .where("key", "=", "seq")
        .execute();
    }
    if (state.written > 0) await options.quota?.record(trx, state.written);
    return { epoch: await readEpoch(trx), results, inserted: state.inserted };
  });
}

async function pushOne(
  trx: ServerTrx,
  userId: string,
  deviceId: string,
  change: Change,
  now: number,
  state: PushState,
): Promise<PushResult> {
  if (!isWellFormed(change)) return reject("invalid");
  if (parseHlc(change.hlc).wall > now + FUTURE_CLOCK_LIMIT_MS) {
    return reject("future_clock");
  }
  const data = canonicalJson(change.data);
  const deleted = change.deleted ? 1 : 0;
  const head = await trx
    .selectFrom("head")
    .select(["hlc", "data", "deleted", "v"])
    .where("user_id", "=", userId)
    .where("table_name", "=", change.table)
    .where("id", "=", change.id)
    .executeTakeFirst();
  if (head && change.hlc === head.hlc) {
    // Migrations rewrite data but keep the HLC, so the same HLC at another
    // schema version is the same row version, not a conflict.
    const duplicate =
      head.deleted === deleted && (head.v !== change.v || head.data === data);
    return duplicate ? { status: "ok" } : reject("conflict");
  }
  // A version older than the stored one has already lost everywhere: devices
  // that pull get the newer one. A retry of a superseded push lands here too.
  if (head && change.hlc < head.hlc) return { status: "ok" };
  // An older app would reset columns it doesn't know about.
  if (change.v < state.maxV) return reject("schema_outdated");
  const size = rowBytes(change.table, change.id, data);
  const growth =
    size - (head ? rowBytes(change.table, change.id, head.data) : 0);
  if (
    state.quotaReached ||
    state.written + size > state.allowance.written ||
    // Only growth counts: a user over a lowered limit can still shrink.
    (growth > 0 && state.grown + growth > state.allowance.stored)
  ) {
    state.quotaReached = true;
    return reject("quota");
  }
  state.written += size;
  state.grown += growth;

  const row = {
    hlc: change.hlc,
    deleted,
    v: change.v,
    data,
    seq: ++state.seq,
    device_id: deviceId,
    received_at: now,
  };
  await trx
    .insertInto("head")
    .values({
      user_id: userId,
      table_name: change.table,
      id: change.id,
      ...row,
    })
    .onConflict((oc) =>
      oc.columns(["user_id", "table_name", "id"]).doUpdateSet(row),
    )
    .execute();
  state.inserted++;
  state.maxV = Math.max(state.maxV, change.v);
  return { status: "ok" };
}

function reject(reason: Extract<PushResult, { status: "rejected" }>["reason"]) {
  return { status: "rejected", reason } as const;
}

function isWellFormed(change: Change): boolean {
  return (
    typeof change === "object" &&
    change !== null &&
    typeof change.table === "string" &&
    TABLE_PATTERN.test(change.table) &&
    typeof change.id === "string" &&
    ID_PATTERN.test(change.id) &&
    typeof change.hlc === "string" &&
    isValidHlc(change.hlc) &&
    typeof change.deleted === "boolean" &&
    Number.isSafeInteger(change.v) &&
    change.v >= 1 &&
    isFlatObject(change.data)
  );
}

function isFlatObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (v) =>
      v === null ||
      typeof v === "string" ||
      typeof v === "boolean" ||
      (typeof v === "number" && Number.isFinite(v)),
  );
}

/** Sorted keys, so equal objects from different clients compare equal as text. */
export function canonicalJson(data: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(data).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
  );
}

/**
 * Rows whose newest version came after `after`, in `seq` order. A row
 * replaced several times since then arrives once, in its newest version.
 */
export async function pull(
  db: ServerDb,
  userId: string,
  after: number,
  limit: number = MAX_PULL_LIMIT,
): Promise<PullResponse> {
  const pageSize = Math.min(Math.max(Math.trunc(limit), 1), MAX_PULL_LIMIT);
  return db.transaction().execute(async (trx) => {
    const rows = await trx
      .selectFrom("head")
      .select(["seq", "table_name", "id", "hlc", "deleted", "v", "data"])
      .where("user_id", "=", userId)
      .where("seq", ">", after)
      .orderBy("seq")
      .limit(pageSize + 1)
      .execute();
    const page = rows.slice(0, pageSize);
    return {
      epoch: await readEpoch(trx),
      changes: page.map(
        (row): PulledChange => ({ ...toChange(row), seq: row.seq }),
      ),
      cursor: page.at(-1)?.seq ?? after,
      more: rows.length > pageSize,
    };
  });
}

/** The user's head rows, including tombstones, and the cursor that matches them. */
export async function snapshot(
  db: ServerDb,
  userId: string,
): Promise<SnapshotResponse> {
  return db.transaction().execute(async (trx) => {
    const rows = await trx
      .selectFrom("head")
      .select(["table_name", "id", "hlc", "deleted", "v", "data"])
      .where("user_id", "=", userId)
      .execute();
    const max = await trx
      .selectFrom("head")
      .select((eb) => eb.fn.max("seq").as("seq"))
      .where("user_id", "=", userId)
      .executeTakeFirst();
    return {
      epoch: await readEpoch(trx),
      changes: rows.map(toChange),
      cursor: max?.seq ?? 0,
    };
  });
}

type ChangeRow = Pick<
  Selectable<HeadTable>,
  "table_name" | "id" | "hlc" | "deleted" | "v" | "data"
>;

function toChange(row: ChangeRow): Change {
  return {
    table: row.table_name,
    id: row.id,
    hlc: row.hlc,
    deleted: row.deleted === 1,
    v: row.v,
    data: JSON.parse(row.data),
  };
}

export function readEpoch(db: ServerDb | ServerTrx): Promise<string> {
  return readMeta(db, "epoch");
}

async function readMeta(
  db: ServerDb | ServerTrx,
  key: "epoch" | "seq",
): Promise<string> {
  const row = await db
    .selectFrom("server_meta")
    .select("value")
    .where("key", "=", key)
    .executeTakeFirstOrThrow();
  return row.value;
}

/**
 * Ends a whole-database restore. Clients that see the new epoch re-upload
 * everything and pull from the start. See docs/sync.md#server-restore-and-epoch.
 */
export async function newEpoch(
  db: ServerDb,
  now: number = Date.now(),
): Promise<string> {
  const value = crypto.randomUUID();
  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("server_meta")
      .set({ value })
      .where("key", "=", "epoch")
      .execute();
    // The re-upload that follows is exempt from the daily write quota.
    await trx
      .insertInto("server_meta")
      .values({ key: "epoch_started_at", value: String(now) })
      .onConflict((oc) => oc.column("key").doUpdateSet({ value: String(now) }))
      .execute();
  });
  return value;
}

/** When the current epoch began, if it began with `newEpoch`. */
export async function readEpochStartedAt(
  db: ServerDb | ServerTrx,
): Promise<number | null> {
  const row = await db
    .selectFrom("server_meta")
    .select("value")
    .where("key", "=", "epoch_started_at")
    .executeTakeFirst();
  return row ? Number(row.value) : null;
}
