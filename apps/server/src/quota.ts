import {
  type PushQuota,
  ROW_OVERHEAD_BYTES,
  readEpochStartedAt,
  type ServerDb,
} from "@workout-logger/core/sync-server";
import { sql, type Transaction } from "kysely";
import type { ServerKysely, ServerTables } from "./db/database.ts";

// docs/accounts.md#quotas. Byte counts are core's `rowBytes`.

const MB = 1024 * 1024;
const DAY = 24 * 60 * 60 * 1000;

/** Core's `rowBytes` of a `head` row. */
export const rowBytesSql = sql<number>`length(CAST(data AS BLOB)) + length(table_name) + length(id) + ${sql.lit(ROW_OVERHEAD_BYTES)}`;

const MAX_BYTES = 20 * MB;

export const DEFAULT_QUOTA = {
  bytesPerDay: 5 * MB,
  maxBytes: MAX_BYTES,
  requestsPerMinute: 60,
  snapshotsPerDay: 10,
};

/** How long account creation, a new epoch, or the owner's grant lift the daily limit. */
export const EXEMPTION_MS = DAY;
export const USAGE_RETENTION_DAYS = 90;

type Db = ServerKysely | Transaction<ServerTables>;

/** A user's limits; null is unlimited, as for the owner. */
export interface Limits {
  bytesPerDay: number | null;
  maxBytes: number | null;
  snapshotsPerDay: number | null;
  /** The end of the exemption from the daily write limit in force, if any. */
  exemptUntil: number | null;
}

const UNLIMITED: Limits = {
  bytesPerDay: null,
  maxBytes: null,
  snapshotsPerDay: null,
  exemptUntil: null,
};

/** The UTC day `usage` rows are kept by. */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Better Auth writes dates on SQLite as ISO text. */
export function toMillis(value: string | number): number {
  return typeof value === "number" ? value : Date.parse(value);
}

/** Null when the user doesn't exist. */
export async function readLimits(
  db: Db,
  userId: string,
  now: number,
): Promise<Limits | null> {
  const user = await db
    .selectFrom("user")
    .select(["role", "createdAt"])
    .where("id", "=", userId)
    .executeTakeFirst();
  if (!user) return null;
  if (user.role === "owner") return UNLIMITED;
  const override = await db
    .selectFrom("quota")
    .selectAll()
    .where("user_id", "=", userId)
    .executeTakeFirst();
  const epochStartedAt = await readEpochStartedAt(db as unknown as ServerDb);
  const exemptUntil = Math.max(
    toMillis(user.createdAt) + EXEMPTION_MS,
    epochStartedAt === null ? 0 : epochStartedAt + EXEMPTION_MS,
    override?.exempt_until ?? 0,
  );
  return {
    bytesPerDay: override?.bytes_per_day ?? DEFAULT_QUOTA.bytesPerDay,
    maxBytes: override?.max_bytes ?? DEFAULT_QUOTA.maxBytes,
    snapshotsPerDay:
      override?.snapshots_per_day ?? DEFAULT_QUOTA.snapshotsPerDay,
    exemptUntil: exemptUntil > now ? exemptUntil : null,
  };
}

export async function storedBytes(db: Db, userId: string): Promise<number> {
  const row = await db
    .selectFrom("head")
    .select(sql<number>`coalesce(sum(${rowBytesSql}), 0)`.as("bytes"))
    .where("user_id", "=", userId)
    .executeTakeFirstOrThrow();
  return row.bytes;
}

export async function usageOn(
  db: Db,
  userId: string,
  day: string,
): Promise<{ bytesWritten: number; snapshots: number }> {
  const row = await db
    .selectFrom("usage")
    .select(["bytes_written", "snapshots"])
    .where("user_id", "=", userId)
    .where("day", "=", day)
    .executeTakeFirst();
  return {
    bytesWritten: row?.bytes_written ?? 0,
    snapshots: row?.snapshots ?? 0,
  };
}

async function addUsage(
  db: Db,
  userId: string,
  day: string,
  add: { bytesWritten?: number; snapshots?: number },
): Promise<void> {
  const bytes = add.bytesWritten ?? 0;
  const snapshots = add.snapshots ?? 0;
  await db
    .insertInto("usage")
    .values({ user_id: userId, day, bytes_written: bytes, snapshots })
    .onConflict((oc) =>
      oc.columns(["user_id", "day"]).doUpdateSet((eb) => ({
        bytes_written: eb("usage.bytes_written", "+", bytes),
        snapshots: eb("usage.snapshots", "+", snapshots),
      })),
    )
    .execute();
}

/** The quota hook of core's `push` for one user's push. */
export function pushQuota(userId: string, now: number): PushQuota {
  const day = utcDay(now);
  return {
    async allowance(trx) {
      const db = trx as unknown as Transaction<ServerTables>;
      const limits = await readLimits(db, userId, now);
      if (!limits) return { written: 0, stored: 0 };
      const written =
        limits.bytesPerDay === null || limits.exemptUntil !== null
          ? Number.POSITIVE_INFINITY
          : limits.bytesPerDay - (await usageOn(db, userId, day)).bytesWritten;
      const stored =
        limits.maxBytes === null
          ? Number.POSITIVE_INFINITY
          : limits.maxBytes - (await storedBytes(db, userId));
      return { written, stored };
    },
    async record(trx, written) {
      await addUsage(trx as unknown as Transaction<ServerTables>, userId, day, {
        bytesWritten: written,
      });
    },
  };
}

/** Counts a snapshot download; false when today's are used up. */
export function takeSnapshot(
  db: ServerKysely,
  userId: string,
  now: number,
): Promise<boolean> {
  const day = utcDay(now);
  return db.transaction().execute(async (trx) => {
    const limits = await readLimits(trx, userId, now);
    if (!limits) return false;
    const { snapshots } = await usageOn(trx, userId, day);
    if (
      limits.snapshotsPerDay !== null &&
      snapshots >= limits.snapshotsPerDay
    ) {
      return false;
    }
    await addUsage(trx, userId, day, { snapshots: 1 });
    return true;
  });
}

/** What `GET /api/me/usage` answers. Limits are null when unlimited. */
export interface UsageReport {
  day: string;
  bytesWritten: number;
  bytesPerDay: number | null;
  /** The daily limit doesn't apply until then. */
  exemptUntil: number | null;
  storedBytes: number;
  maxBytes: number | null;
  snapshots: number;
  snapshotsPerDay: number | null;
}

export async function usageReport(
  db: ServerKysely,
  userId: string,
  now: number,
): Promise<UsageReport | null> {
  const day = utcDay(now);
  const limits = await readLimits(db, userId, now);
  if (!limits) return null;
  const usage = await usageOn(db, userId, day);
  return {
    day,
    bytesWritten: usage.bytesWritten,
    bytesPerDay: limits.bytesPerDay,
    exemptUntil: limits.exemptUntil,
    storedBytes: await storedBytes(db, userId),
    maxBytes: limits.maxBytes,
    snapshots: usage.snapshots,
    snapshotsPerDay: limits.snapshotsPerDay,
  };
}

export const PRUNE_USAGE_JOB = "prune-usage";

export async function pruneUsage(db: ServerKysely, now: number) {
  await db
    .deleteFrom("usage")
    .where("day", "<", utcDay(now - USAGE_RETENTION_DAYS * DAY))
    .execute();
}
