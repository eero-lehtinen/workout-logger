import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  brotliCompress,
  brotliDecompressSync,
  constants,
  gunzipSync,
} from "node:zlib";
import Database from "better-sqlite3";
import { sql } from "kysely";
import type { ServerKysely } from "../db/database.ts";
import type { BackupStore } from "./r2.ts";

const brotliAsync = promisify(brotliCompress);

/**
 * Brotli at quality 9 makes copies about 40% smaller than gzip, at a third of
 * its speed (about 50 MB/s); R2 keeps several copies. Quality 11 is smaller
 * still but 40 times slower, too slow for the copy taken before a migration,
 * which startup waits for.
 */
export function compressCopy(bytes: Buffer): Promise<Buffer> {
  return brotliAsync(bytes, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 9,
      [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
    },
  });
}

/** The database file of a copy; `.gz` for copies made before Brotli. */
export function unpackCopy(name: string, bytes: Buffer): Buffer {
  return name.endsWith(".gz") ? gunzipSync(bytes) : brotliDecompressSync(bytes);
}

/**
 * Copies the live database to `key` in the backup bucket: `VACUUM INTO` a
 * temp file, `integrity_check` it, compress, upload (docs/backups.md#layers).
 */
export async function uploadDbCopy(
  db: ServerKysely,
  store: BackupStore,
  key: string,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "wl-backup-"));
  const file = join(dir, "copy.db");
  try {
    // Through Kysely, so it waits for a transaction in progress on the
    // shared connection instead of failing inside it.
    await sql`VACUUM INTO ${file}`.execute(db);
    const copy = new Database(file, { readonly: true });
    try {
      const result = copy.pragma("integrity_check", { simple: true });
      if (result !== "ok") throw new Error(`integrity check: ${result}`);
    } finally {
      copy.close();
    }
    await store.put(key, await compressCopy(await readFile(file)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** `daily/<date>.db.br`, plus `monthly/<date>.db.br` on the 1st (UTC). */
export function dailyKeys(at: Date): string[] {
  const date = at.toISOString().slice(0, 10);
  const keys = [`daily/${date}.db.br`];
  if (at.getUTCDate() === 1) keys.push(`monthly/${date}.db.br`);
  return keys;
}

export function preMigrationKey(at: Date, migration: string): string {
  const stamp = at.toISOString().replaceAll(":", "-");
  return `pre-migration/${stamp}-${migration.replaceAll(/[^\w.-]/g, "_")}.db.br`;
}
