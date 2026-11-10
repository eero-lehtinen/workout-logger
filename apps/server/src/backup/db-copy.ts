import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import Database from "better-sqlite3";
import { sql } from "kysely";
import type { ServerKysely } from "../db/database.ts";
import type { BackupStore } from "./r2.ts";

const gzipAsync = promisify(gzip);

/**
 * Copies the live database to `key` in the backup bucket: `VACUUM INTO` a
 * temp file, `integrity_check` it, gzip, upload (docs/backups.md#layers).
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
    await store.put(key, await gzipAsync(await readFile(file)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** `daily/<date>.db.gz`, plus `monthly/<date>.db.gz` on the 1st (UTC). */
export function dailyKeys(at: Date): string[] {
  const date = at.toISOString().slice(0, 10);
  const keys = [`daily/${date}.db.gz`];
  if (at.getUTCDate() === 1) keys.push(`monthly/${date}.db.gz`);
  return keys;
}

export function preMigrationKey(at: Date, migration: string): string {
  const stamp = at.toISOString().replaceAll(":", "-");
  return `pre-migration/${stamp}-${migration.replaceAll(/[^\w.-]/g, "_")}.db.gz`;
}
