import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import Database from "better-sqlite3";
import { sql } from "kysely";
import type { ServerKysely } from "../db/database.ts";
import { integrityOf, unpackCopyFile } from "./db-copy.ts";
import type { BackupStore, StoredObject } from "./r2.ts";

const DAY = 24 * 60 * 60 * 1000;
/** The daily copy runs every day, so a newer one should be there. */
const MAX_COPY_AGE = 2 * DAY;

/**
 * Rows in these leave only when an account is deleted, so a copy of a
 * database that has some has some too. Other tables can be empty in a good
 * copy, e.g. sessions that expired since.
 */
const CHECKED_TABLES = ["head", "user"] as const;

const DAILY_KEY = /^daily\/(\d{4}-\d{2}-\d{2})\.db\.(br|gz)$/;

/**
 * Litestream uploads every 10 s (`sync-interval` in deploy/compose.yaml).
 * After this long, everything committed before the wait is in the replica.
 */
export const REPLICA_SETTLE_MS = 30_000;

/**
 * Restores the newest daily copy from the bucket into a temp file and checks
 * it against the live database (docs/backups.md#restore-rehearsal). Throws
 * what is wrong with it.
 */
export async function rehearseCopyRestore(
  db: ServerKysely,
  store: BackupStore,
  now: number,
): Promise<void> {
  const newest = newestDailyCopy(await store.list());
  if (!newest) throw new Error("no daily copy in the bucket");
  if (now - newest.copiedAt > MAX_COPY_AGE) {
    throw new Error(`the newest daily copy, ${newest.key}, is over 2 days old`);
  }
  await inTempDir(newest.key, async (dir) => {
    const packed = join(dir, basename(newest.key));
    await writeFile(packed, await store.get(newest.key));
    const restored = join(dir, "restored.db");
    await unpackCopyFile(packed, restored);
    await checkRestored(db, restored);
  });
}

/**
 * Restores the Litestream replica with `restore` into a temp file and checks
 * it against the live database. The replica must hold every push committed
 * before a wait of `settleMs`: the restored `seq` can't be lower than the
 * live one before the wait, and the epoch must be the same.
 */
export async function rehearseReplicaRestore(
  db: ServerKysely,
  restore: (out: string) => Promise<void>,
  settleMs = REPLICA_SETTLE_MS,
): Promise<void> {
  const live = await liveMeta(db);
  await sleep(settleMs);
  await inTempDir("replica", async (dir) => {
    const restored = join(dir, "restored.db");
    await restore(restored);
    const integrity = integrityOf(restored);
    if (integrity !== "ok") throw new Error(`integrity check: ${integrity}`);
    await checkRestored(db, restored);
    const replica = restoredMeta(restored);
    if (replica.epoch !== live.epoch) {
      throw new Error(
        `epoch ${replica.epoch} in the replica; the live database has ${live.epoch}`,
      );
    }
    if (replica.seq < live.seq) {
      throw new Error(
        `the replica is at seq ${replica.seq}, but the live database was at ${live.seq} ${settleMs / 1000} s before the restore`,
      );
    }
  });
}

export function newestDailyCopy(
  objects: StoredObject[],
): { key: string; copiedAt: number } | null {
  let newest: { key: string; copiedAt: number } | null = null;
  for (const { key } of objects) {
    const date = DAILY_KEY.exec(key)?.[1];
    if (!date) continue;
    const copiedAt = Date.parse(`${date}T00:00:00Z`);
    if (!newest || copiedAt > newest.copiedAt) newest = { key, copiedAt };
  }
  return newest;
}

/** Runs `work` in a temp directory, removed after; errors name `source`. */
async function inTempDir(
  source: string,
  work: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "wl-rehearsal-"));
  try {
    await work(dir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${source}: ${message}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function checkRestored(db: ServerKysely, path: string): Promise<void> {
  const copy = new Database(path, { readonly: true });
  try {
    for (const table of CHECKED_TABLES) {
      const copyRows = copy
        .prepare(`SELECT count(*) FROM "${table}"`)
        .pluck()
        .get() as number;
      const liveRows = await countRows(db, table);
      if (liveRows > 0 && copyRows === 0) {
        throw new Error(
          `no ${table} rows in the copy; the live database has ${liveRows}`,
        );
      }
    }
  } finally {
    copy.close();
  }
}

async function countRows(db: ServerKysely, table: string): Promise<number> {
  const { rows } = await sql<{
    n: number;
  }>`SELECT count(*) AS n FROM ${sql.table(table)}`.execute(db);
  return rows[0]?.n ?? 0;
}

interface Meta {
  epoch: string;
  seq: number;
}

/** `seq` only grows, also when an account's rows are deleted. */
async function liveMeta(db: ServerKysely): Promise<Meta> {
  const rows = await db.selectFrom("server_meta").selectAll().execute();
  return toMeta(rows);
}

function restoredMeta(path: string): Meta {
  const copy = new Database(path, { readonly: true });
  try {
    return toMeta(
      copy.prepare("SELECT key, value FROM server_meta").all() as {
        key: string;
        value: string;
      }[],
    );
  } finally {
    copy.close();
  }
}

function toMeta(rows: { key: string; value: string }[]): Meta {
  const value = (key: string) => rows.find((row) => row.key === key)?.value;
  return { epoch: value("epoch") ?? "", seq: Number(value("seq") ?? 0) };
}
