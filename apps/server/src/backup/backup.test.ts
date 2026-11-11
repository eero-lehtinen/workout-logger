import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { readEpoch } from "@workout-logger/core/sync-server";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { authOptions } from "../auth/auth.ts";
import { openDatabase, syncDb } from "../db/database.ts";
import { readJob, runJob } from "../jobs.ts";
import {
  dailyCopyJob,
  finishRestore,
  prepareDatabase,
  restoredMarker,
} from "../startup.ts";
import { DAILY_COPY_JOB } from "../status.ts";
import { openTestApp } from "../testing.ts";
import { dailyKeys } from "./db-copy.ts";
import type { BackupStore } from "./r2.ts";

function memoryStore() {
  const files = new Map<string, Uint8Array>();
  const store: BackupStore = {
    async put(key, body) {
      files.set(key, body);
    },
  };
  return { files, store };
}

function tablesIn(gz: Uint8Array): string[] {
  const db = new Database(Buffer.from(gunzipSync(gz)));
  const names = db
    .prepare("select name from sqlite_master where type = 'table'")
    .pluck()
    .all() as string[];
  db.close();
  return names;
}

describe("daily DB copy", () => {
  it("uploads a gzipped, checked copy and records the run", async () => {
    const { db } = await openTestApp();
    const { files, store } = memoryStore();
    expect(await runJob(db, dailyCopyJob(db, store), () => 1000)).toBe(true);
    const [key] = dailyKeys(new Date());
    expect(tablesIn(files.get(key ?? "") ?? new Uint8Array())).toContain(
      "head",
    );
    expect(await readJob(db, DAILY_COPY_JOB)).toEqual({
      lastRunAt: 1000,
      lastOkAt: 1000,
      lastError: null,
    });
  });

  it("keeps the last good run when a run fails", async () => {
    const { db } = await openTestApp();
    const { store } = memoryStore();
    await runJob(db, dailyCopyJob(db, store), () => 1000);
    const failing: BackupStore = {
      put: () => Promise.reject(new Error("R2 down")),
    };
    expect(await runJob(db, dailyCopyJob(db, failing), () => 2000)).toBe(false);
    expect(await readJob(db, DAILY_COPY_JOB)).toEqual({
      lastRunAt: 2000,
      lastOkAt: 1000,
      lastError: "R2 down",
    });
  });

  it("adds a monthly copy on the 1st", () => {
    expect(dailyKeys(new Date("2026-12-01T03:00:00Z"))).toEqual([
      "daily/2026-12-01.db.gz",
      "monthly/2026-12-01.db.gz",
    ]);
  });
});

describe("pre-migration copy", () => {
  const settings = (db: unknown) =>
    authOptions({
      db: db as never,
      publicUrl: "http://localhost:3000",
      secret: "test-secret-that-is-long-enough-for-better-auth",
      github: undefined,
    });

  it("is skipped for a new database", async () => {
    const { db } = openDatabase(":memory:");
    const { files, store } = memoryStore();
    await prepareDatabase(db, settings(db), store);
    expect(files.size).toBe(0);
  });

  it("is taken before migrating a database with data", async () => {
    const { db, sqlite } = openDatabase(":memory:");
    sqlite.exec("create table legacy (x)");
    const { files, store } = memoryStore();
    await prepareDatabase(db, settings(db), store);
    const [key, body] = [...files][0] ?? [];
    expect(key).toMatch(/^pre-migration\/.+0001_sync\.db\.gz$/);
    expect(tablesIn(body ?? new Uint8Array())).toEqual(["legacy"]);
  });

  it("blocks the migration when the copy fails", async () => {
    const { db, sqlite } = openDatabase(":memory:");
    sqlite.exec("create table legacy (x)");
    const failing: BackupStore = {
      put: () => Promise.reject(new Error("R2 down")),
    };
    await expect(prepareDatabase(db, settings(db), failing)).rejects.toThrow(
      "R2 down",
    );
    expect(
      sqlite.prepare("select name from sqlite_master").pluck().all(),
    ).toEqual(["legacy"]);
  });
});

describe("restored database", () => {
  it("gets a new epoch before serving, once", async () => {
    const { db } = await openTestApp();
    const sync = syncDb(db);
    const path = join(mkdtempSync(join(tmpdir(), "wl-restore-")), "app.db");
    const before = await readEpoch(sync);
    await finishRestore(db, path);
    expect(await readEpoch(sync)).toBe(before);

    writeFileSync(restoredMarker(path), "");
    await finishRestore(db, path);
    const after = await readEpoch(sync);
    expect(after).not.toBe(before);
    expect(existsSync(restoredMarker(path))).toBe(false);
    await finishRestore(db, path);
    expect(await readEpoch(sync)).toBe(after);
  });
});

describe("/api/status", () => {
  it("shows the owner the backup layers", async () => {
    const { app, signIn } = await openTestApp({ backupsConfigured: true });
    const { token } = await signIn("owner@example.com", "owner");
    const owner = await app.request("/api/status", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(await owner.json()).toMatchObject({
      backupsOk: false,
      epoch: expect.any(String),
      backups: {
        litestream: { configured: false, stale: false },
        dailyCopy: { configured: true, lastOkAt: null, stale: true },
      },
    });
  });

  it("shows others only the summary", async () => {
    const { app, signIn } = await openTestApp({ backupsConfigured: true });
    const { token } = await signIn("user@example.com");
    const variants: Record<string, string>[] = [
      {},
      { authorization: `Bearer ${token}` },
    ];
    for (const headers of variants) {
      const res = await app.request("/api/status", { headers });
      const body = (await res.json()) as object;
      expect(Object.keys(body).sort()).toEqual([
        "backupsOk",
        "commit",
        "version",
      ]);
    }
  });
});
