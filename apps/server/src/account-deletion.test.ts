import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Change } from "@workout-logger/core";
import { formatHlc, SCHEMA_VERSION } from "@workout-logger/core";
import { push } from "@workout-logger/core/sync-server";
import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { deleteAccount } from "./account-deletion.ts";
import { authOptions } from "./auth/auth.ts";
import { openDatabase, type ServerKysely, syncDb } from "./db/database.ts";
import { migrateServer } from "./db/migrations.ts";
import { openTestApp } from "./testing.ts";

function change(id: string, value: string): Change {
  return {
    table: "setting",
    id,
    hlc: formatHlc({ wall: Date.now(), counter: 0, node: "aaaaaaaaaaaa" }),
    deleted: false,
    v: SCHEMA_VERSION,
    data: { value_json: value },
  };
}

async function pushAs(db: ServerKysely, userId: string, changes: Change[]) {
  await push(
    syncDb(db),
    userId,
    { device_id: "aaaaaaaaaaaa", client_version: "test", changes },
    { now: Date.now() },
  );
}

/** Rows each table holds for `userId`. */
async function rowsOf(db: ServerKysely, userId: string) {
  const count = async (table: string, column: string) => {
    const { rows } = await sql<{
      n: number;
    }>`SELECT count(*) AS n FROM ${sql.table(table)} WHERE ${sql.ref(column)} = ${userId}`.execute(
      db,
    );
    return rows[0]?.n ?? 0;
  };
  return {
    head: await count("head", "user_id"),
    user_sync: await count("user_sync", "user_id"),
    usage: await count("usage", "user_id"),
    quota: await count("quota", "user_id"),
    user: await count("user", "id"),
    session: await count("session", "userId"),
    account: await count("account", "userId"),
  };
}

async function setup() {
  const test = await openTestApp();
  const alice = await test.signIn("alice@example.com");
  const bob = await test.signIn("bob@example.com");
  const owner = await test.signIn("owner@example.com", "owner");
  const ctx = await test.auth.$context;
  for (const [user, accountId] of [
    [alice, "g-alice"],
    [bob, "g-bob"],
  ] as const) {
    await ctx.internalAdapter.createAccount({
      userId: user.userId,
      providerId: "google",
      accountId,
    });
    await pushAs(test.db, user.userId, [change("a", '"x"')]);
    await test.db
      .insertInto("usage")
      .values({
        user_id: user.userId,
        day: "2026-11-11",
        bytes_written: 1,
        snapshots: 0,
      })
      .execute();
    await test.db
      .insertInto("quota")
      .values({ user_id: user.userId, max_bytes: 1 })
      .execute();
  }
  const call = (
    user: { token: string },
    path: string,
    init: RequestInit = {},
  ) =>
    test.app.request(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${user.token}`,
      },
    });
  return { ...test, alice, bob, owner, call };
}

describe("DELETE /api/me", () => {
  it("deletes every row of that user and none of another's", async () => {
    const { db, alice, bob, call } = await setup();
    const before = await rowsOf(db, bob.userId);
    expect(Object.values(before).every((n) => n > 0)).toBe(true);

    const res = await call(alice, "/api/me", {
      method: "DELETE",
      body: JSON.stringify({ email: " Alice@Example.com " }),
    });
    expect(res.status).toBe(204);
    expect(await rowsOf(db, alice.userId)).toEqual({
      head: 0,
      user_sync: 0,
      usage: 0,
      quota: 0,
      user: 0,
      session: 0,
      account: 0,
    });
    expect(await rowsOf(db, bob.userId)).toEqual(before);
    expect((await call(alice, "/api/me")).status).toBe(401);
  });

  it("needs the account's email", async () => {
    const { alice, call } = await setup();
    for (const body of [{ email: "bob@example.com" }, {}]) {
      const res = await call(alice, "/api/me", {
        method: "DELETE",
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
    }
    expect((await call(alice, "/api/me")).status).toBe(200);
  });

  it("refuses the owner", async () => {
    const { owner, call } = await setup();
    const res = await call(owner, "/api/me", {
      method: "DELETE",
      body: JSON.stringify({ email: "owner@example.com" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/admin/users/:id", () => {
  it("deletes another account, never the owner's own", async () => {
    const { db, owner, alice, call } = await setup();
    const own = await call(owner, `/api/admin/users/${owner.userId}`, {
      method: "DELETE",
    });
    expect(own.status).toBe(400);
    const res = await call(owner, `/api/admin/users/${alice.userId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect((await rowsOf(db, alice.userId)).user).toBe(0);
    expect(
      (
        await call(alice, `/api/admin/users/${owner.userId}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(401);
  });
});

describe("secure delete", () => {
  const MARKER = "deleted-user-marker-7f3a";

  /** The database file's bytes after deleting a user whose data had `MARKER`. */
  async function fileAfterDeletion(secure: boolean) {
    const path = join(mkdtempSync(join(tmpdir(), "wl-delete-")), "app.db");
    const database = openDatabase(path);
    if (!secure) database.sqlite.pragma("secure_delete = OFF");
    await migrateServer(
      database.db,
      authOptions({
        db: database.db as never,
        publicUrl: "http://localhost:3000",
        secret: "test-secret-that-is-long-enough-for-better-auth",
        signIn: {},
      }),
    );
    await pushAs(database.db, "u1", [change("note", `"${MARKER.repeat(50)}"`)]);
    await pushAs(database.db, "u2", [change("note", '"kept"')]);
    database.sqlite.pragma("wal_checkpoint(TRUNCATE)");
    await deleteAccount(database.db, "u1");
    database.sqlite.pragma("wal_checkpoint(TRUNCATE)");
    await database.close();
    return readFileSync(path).toString("latin1");
  }

  it("leaves none of a deleted user's data in the file", async () => {
    expect(await fileAfterDeletion(true)).not.toContain(MARKER);
  });

  it("would leave it without the pragma", async () => {
    expect(await fileAfterDeletion(false)).toContain(MARKER);
  });
});
