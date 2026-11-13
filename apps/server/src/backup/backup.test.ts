import { copyFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { newEpoch, readEpoch } from "@workout-logger/core/sync-server";
import Database from "better-sqlite3";
import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { authOptions } from "../auth/auth.ts";
import { openDatabase, syncDb } from "../db/database.ts";
import { readJob, runJob, startJobs } from "../jobs.ts";
import {
  copyRehearsalJob,
  dailyCopyJob,
  finishRestore,
  prepareDatabase,
  replicaRehearsalJob,
  restoredMarker,
} from "../startup.ts";
import {
  COPY_REHEARSAL_JOB,
  DAILY_COPY_JOB,
  REPLICA_REHEARSAL_JOB,
} from "../status.ts";
import { openTestApp } from "../testing.ts";
import {
  compressCopy,
  dailyKeys,
  unpackCopy,
  unpackCopyFile,
} from "./db-copy.ts";
import { type BackupStore, parseListPage } from "./r2.ts";
import {
  newestDailyCopy,
  rehearseCopyRestore,
  rehearseReplicaRestore,
} from "./rehearsal.ts";

function memoryStore() {
  const files = new Map<string, Uint8Array>();
  const store: BackupStore = {
    async put(key, body) {
      files.set(key, body);
    },
    async get(key) {
      const body = files.get(key);
      if (!body) throw new Error(`no ${key}`);
      return body;
    },
    async list() {
      return [...files].map(([key, body]) => ({ key, size: body.length }));
    },
  };
  return { files, store };
}

const failingStore: BackupStore = {
  put: () => Promise.reject(new Error("R2 down")),
  get: () => Promise.reject(new Error("R2 down")),
  list: () => Promise.reject(new Error("R2 down")),
};

function tablesIn(copy: Uint8Array): string[] {
  const db = new Database(unpackCopy("copy.db.br", Buffer.from(copy)));
  const names = db
    .prepare("select name from sqlite_master where type = 'table'")
    .pluck()
    .all() as string[];
  db.close();
  return names;
}

describe("daily DB copy", () => {
  it("uploads a compressed, checked copy and records the run", async () => {
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
    expect(await runJob(db, dailyCopyJob(db, failingStore), () => 2000)).toBe(
      false,
    );
    expect(await readJob(db, DAILY_COPY_JOB)).toEqual({
      lastRunAt: 2000,
      lastOkAt: 1000,
      lastError: "R2 down",
    });
  });

  it("adds a monthly copy on the 1st", () => {
    expect(dailyKeys(new Date("2026-12-01T03:00:00Z"))).toEqual([
      "daily/2026-12-01.db.br",
      "monthly/2026-12-01.db.br",
    ]);
  });
});

describe("restore rehearsal", () => {
  const today = () => dailyKeys(new Date())[0] ?? "";

  it("restores the newest daily copy and records the run", async () => {
    const { db, signIn } = await openTestApp();
    await signIn("owner@example.com", "owner");
    const { store } = memoryStore();
    await runJob(db, dailyCopyJob(db, store));
    expect(await runJob(db, copyRehearsalJob(db, store), () => 1000)).toBe(
      true,
    );
    expect(await readJob(db, COPY_REHEARSAL_JOB)).toEqual({
      lastRunAt: 1000,
      lastOkAt: 1000,
      lastError: null,
    });
  });

  it("fails without a daily copy", async () => {
    const { db } = await openTestApp();
    await expect(
      rehearseCopyRestore(db, memoryStore().store, Date.now()),
    ).rejects.toThrow("no daily copy in the bucket");
  });

  it("fails when the newest copy is over 2 days old", async () => {
    const { db } = await openTestApp();
    const { files, store } = memoryStore();
    await runJob(db, dailyCopyJob(db, store));
    files.set("daily/2026-01-01.db.br", files.get(today()) ?? new Uint8Array());
    files.delete(today());
    await expect(
      rehearseCopyRestore(db, store, Date.parse("2026-01-02T23:59:00Z")),
    ).resolves.toBeUndefined();
    await expect(
      rehearseCopyRestore(db, store, Date.parse("2026-01-03T00:01:00Z")),
    ).rejects.toThrow("daily/2026-01-01.db.br, is over 2 days old");
  });

  it("fails on a copy that isn't a database", async () => {
    const { db } = await openTestApp();
    const { files, store } = memoryStore();
    files.set(today(), await compressCopy(Buffer.from("not a database")));
    await expect(rehearseCopyRestore(db, store, Date.now())).rejects.toThrow(
      `${today()}: integrity check`,
    );
  });

  it("fails on a copy without the live database's accounts", async () => {
    const { db, signIn } = await openTestApp();
    const { store } = memoryStore();
    await runJob(db, dailyCopyJob(db, store));
    await signIn("owner@example.com", "owner");
    await expect(rehearseCopyRestore(db, store, Date.now())).rejects.toThrow(
      "no user rows in the copy; the live database has 1",
    );
  });

  it("picks the newest daily copy, not monthly or pre-migration ones", () => {
    expect(
      newestDailyCopy([
        { key: "daily/2026-11-11.db.br", size: 1 },
        { key: "daily/2026-11-12.db.br", size: 1 },
        { key: "daily/2026-01-01.db.gz", size: 1 },
        { key: "monthly/2026-11-13.db.br", size: 1 },
        { key: "pre-migration/2026-11-14T00-00-00.000Z-x.db.br", size: 1 },
      ]),
    ).toEqual({
      key: "daily/2026-11-12.db.br",
      copiedAt: Date.parse("2026-11-12T00:00:00Z"),
    });
    expect(newestDailyCopy([])).toBeNull();
  });

  it("runs after the daily copy when both catch up at startup", async () => {
    const { db } = await openTestApp();
    const { store } = memoryStore();
    const jobs = await startJobs(db, [
      dailyCopyJob(db, store),
      copyRehearsalJob(db, store),
    ]);
    await jobs.caughtUp;
    jobs.stop();
    expect((await readJob(db, COPY_REHEARSAL_JOB))?.lastError).toBeNull();
  });
});

describe("replica restore rehearsal", () => {
  /** A replica that has everything committed when it is restored. */
  const upToDate =
    (db: Awaited<ReturnType<typeof openTestApp>>["db"]) =>
    async (out: string) => {
      await sql`VACUUM INTO ${out}`.execute(db);
    };

  /** A replica that stopped at the database as it is now. */
  async function frozen(db: Awaited<ReturnType<typeof openTestApp>>["db"]) {
    const file = join(mkdtempSync(join(tmpdir(), "wl-replica-")), "app.db");
    await sql`VACUUM INTO ${file}`.execute(db);
    return async (out: string) => copyFileSync(file, out);
  }

  async function bumpSeq(db: Awaited<ReturnType<typeof openTestApp>>["db"]) {
    await db
      .updateTable("server_meta")
      .set({ value: sql`value + 1` })
      .where("key", "=", "seq")
      .execute();
  }

  it("restores the replica and records the run", async () => {
    const { db, signIn } = await openTestApp();
    await signIn("owner@example.com", "owner");
    const job = replicaRehearsalJob(db, upToDate(db), 0);
    expect(await runJob(db, job, () => 1000)).toBe(true);
    expect(await readJob(db, REPLICA_REHEARSAL_JOB)).toMatchObject({
      lastOkAt: 1000,
      lastError: null,
    });
  });

  it("fails when the replica lacks a push from before the wait", async () => {
    const { db } = await openTestApp();
    const restore = await frozen(db);
    await bumpSeq(db);
    await expect(rehearseReplicaRestore(db, restore, 0)).rejects.toThrow(
      /^replica: the replica is at seq \d+, but the live database was at \d+ 0 s before the restore$/,
    );
  });

  it("passes when only pushes during the wait are missing", async () => {
    const { db } = await openTestApp();
    const restore = await frozen(db);
    await expect(
      rehearseReplicaRestore(
        db,
        async (out) => {
          await bumpSeq(db);
          await restore(out);
        },
        0,
      ),
    ).resolves.toBeUndefined();
  });

  it("fails on a replica from another epoch", async () => {
    const { db } = await openTestApp();
    const restore = await frozen(db);
    await newEpoch(syncDb(db));
    await expect(rehearseReplicaRestore(db, restore, 0)).rejects.toThrow(
      /^replica: epoch .+ in the replica; the live database has /,
    );
  });

  it("fails when the restore fails or writes no database", async () => {
    const { db } = await openTestApp();
    await expect(
      rehearseReplicaRestore(
        db,
        () =>
          Promise.reject(new Error("litestream restore failed: no backups")),
        0,
      ),
    ).rejects.toThrow("replica: litestream restore failed: no backups");
    await expect(
      rehearseReplicaRestore(
        db,
        async (out) => writeFileSync(out, "not a database"),
        0,
      ),
    ).rejects.toThrow("replica: integrity check:");
  });
});

describe("unpack-copy", () => {
  function databaseBytes() {
    const db = new Database(":memory:");
    db.exec("create table t (x); insert into t values (1)");
    const bytes = db.serialize();
    db.close();
    return bytes;
  }

  it("restores a Brotli copy and an older gzip one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wl-unpack-"));
    const bytes = databaseBytes();
    writeFileSync(join(dir, "copy.db.br"), await compressCopy(bytes));
    writeFileSync(join(dir, "old.db.gz"), gzipSync(bytes));
    for (const name of ["copy.db.br", "old.db.gz"]) {
      const out = join(dir, `${name}.db`);
      await unpackCopyFile(join(dir, name), out);
      const db = new Database(out, { readonly: true });
      expect(db.prepare("select x from t").pluck().get()).toBe(1);
      db.close();
    }
  });

  it("refuses to overwrite and leaves no file from a broken copy", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wl-unpack-"));
    const copy = join(dir, "copy.db.br");
    writeFileSync(copy, await compressCopy(Buffer.from("not a database")));
    const out = join(dir, "app.db");
    await expect(unpackCopyFile(copy, out)).rejects.toThrow("integrity");
    expect(existsSync(out)).toBe(false);

    writeFileSync(out, "");
    await expect(unpackCopyFile(copy, out)).rejects.toThrow("exists");
  });
});

describe("pre-migration copy", () => {
  const settings = (db: unknown) =>
    authOptions({
      db: db as never,
      publicUrl: "http://localhost:3000",
      secret: "test-secret-that-is-long-enough-for-better-auth",
      signIn: {},
      maxAccounts: () => 100,
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
    expect(key).toMatch(/^pre-migration\/.+0001_sync\.db\.br$/);
    expect(tablesIn(body ?? new Uint8Array())).toEqual(["legacy"]);
  });

  it("blocks the migration when the copy fails", async () => {
    const { db, sqlite } = openDatabase(":memory:");
    sqlite.exec("create table legacy (x)");
    await expect(
      prepareDatabase(db, settings(db), failingStore),
    ).rejects.toThrow("R2 down");
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

describe("R2 listing", () => {
  const page = (contents: string, truncated = "") => `<?xml version="1.0"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>wl-backups</Name>${contents}${truncated}
</ListBucketResult>`;
  const object = (key: string, size: number) =>
    `<Contents><Key>${key}</Key><Size>${size}</Size></Contents>`;

  it("reads keys and sizes, one object or many", () => {
    expect(parseListPage(page(object("daily/1.db.br", 10)))).toEqual({
      objects: [{ key: "daily/1.db.br", size: 10 }],
      nextToken: undefined,
    });
    expect(
      parseListPage(
        page(
          object("daily/1.db.br", 10) + object("monthly/2.db.br", 20),
          "<IsTruncated>true</IsTruncated><NextContinuationToken>abc</NextContinuationToken>",
        ),
      ),
    ).toEqual({
      objects: [
        { key: "daily/1.db.br", size: 10 },
        { key: "monthly/2.db.br", size: 20 },
      ],
      nextToken: "abc",
    });
  });

  it("reads an empty bucket and refuses anything else", () => {
    expect(parseListPage(page("<KeyCount>0</KeyCount>"))).toEqual({
      objects: [],
      nextToken: undefined,
    });
    expect(() => parseListPage("<Error><Code>x</Code></Error>")).toThrow();
  });
});

describe("/api/admin/backup-storage", () => {
  async function ownerGet(backups: BackupStore | undefined) {
    const { app, signIn } = await openTestApp({ backups });
    const { token, userId } = await signIn("owner@example.com", "owner");
    return app.request("/api/admin/backup-storage", {
      headers: { authorization: `Bearer ${token}`, "x-expected-user": userId },
    });
  }

  it("sums the copies by prefix", async () => {
    const { files, store } = memoryStore();
    files.set("daily/a.db.br", new Uint8Array(10));
    files.set("daily/b.db.br", new Uint8Array(30));
    files.set("pre-migration/c.db.br", new Uint8Array(5));
    files.set("monthly/d.db.br", new Uint8Array(20));
    const res = await ownerGet(store);
    expect(await res.json()).toEqual({
      bytes: 65,
      objects: 4,
      groups: [
        { prefix: "daily", bytes: 40, objects: 2 },
        { prefix: "monthly", bytes: 20, objects: 1 },
        { prefix: "pre-migration", bytes: 5, objects: 1 },
      ],
    });
  });

  it("is null without a bucket, and 502 when R2 fails", async () => {
    expect(await (await ownerGet(undefined)).json()).toBeNull();
    expect((await ownerGet(failingStore)).status).toBe(502);
  });
});

describe("/api/status", () => {
  it("shows the owner the backup layers", async () => {
    const { app, signIn } = await openTestApp({
      backups: memoryStore().store,
    });
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
        copyRehearsal: {
          configured: true,
          lastOkAt: null,
          stale: true,
          failed: false,
        },
        replicaRehearsal: { configured: false, stale: false, failed: false },
      },
    });
  });

  it("is not ok when the last restore rehearsal failed", async () => {
    const { store } = memoryStore();
    const { app, db, signIn } = await openTestApp({
      backups: store,
      replicaRehearsal: true,
    });
    const { token } = await signIn("owner@example.com", "owner");
    await runJob(db, dailyCopyJob(db, store));
    await runJob(db, copyRehearsalJob(db, store));
    const replicaFailing = async () => {
      throw new Error("litestream restore failed: no backups");
    };
    const replicaUp = async (out: string) => {
      await sql`VACUUM INTO ${out}`.execute(db);
    };
    await runJob(db, replicaRehearsalJob(db, replicaUp, 0));
    const status = async () => {
      const res = await app.request("/api/status", {
        headers: { authorization: `Bearer ${token}` },
      });
      return (await res.json()) as { backupsOk: boolean };
    };
    expect((await status()).backupsOk).toBe(true);

    await runJob(db, copyRehearsalJob(db, failingStore));
    expect(await status()).toMatchObject({
      backupsOk: false,
      backups: {
        copyRehearsal: { stale: false, failed: true, lastError: "R2 down" },
      },
    });

    await runJob(db, copyRehearsalJob(db, store));
    await runJob(db, replicaRehearsalJob(db, replicaFailing, 0));
    expect(await status()).toMatchObject({
      backupsOk: false,
      backups: {
        copyRehearsal: { failed: false },
        replicaRehearsal: {
          stale: false,
          failed: true,
          lastError: "replica: litestream restore failed: no backups",
        },
      },
    });
  });

  it("shows others only the summary", async () => {
    const { app, signIn } = await openTestApp({
      backups: memoryStore().store,
    });
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
        "signIn",
        "version",
      ]);
    }
  });
});
