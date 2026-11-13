import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import type { AdminUsers } from "./admin.ts";
import { emailBanKey } from "./ban.ts";
import type { ServerKysely } from "./db/database.ts";
import { openTestApp } from "./testing.ts";

async function count(db: ServerKysely, table: "user" | "account" | "session") {
  const { rows } = await sql<{
    n: number;
  }>`SELECT count(*) AS n FROM ${sql.table(table)}`.execute(db);
  return rows[0]?.n ?? 0;
}

async function setup() {
  const test = await openTestApp();
  const owner = await test.signIn("owner@example.com", "owner");
  const call = (path: string, init: RequestInit = {}) =>
    test.app.request(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
    });
  /** Signs up with Google and returns the new account's id and token. */
  const signUp = async (email: string) => {
    const res = await test.googleSignIn(email);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; user: { id: string } };
    return { userId: body.user.id, token: body.token };
  };
  const ban = (userId: string) =>
    call(`/api/admin/users/${userId}/ban`, { method: "POST" });
  const bans = async () =>
    ((await (await call("/api/admin/users")).json()) as AdminUsers).bans;
  return { ...test, owner, call, signUp, ban, bans };
}

describe("banning an account", () => {
  it("deletes it, ends its sessions, and lists the ban", async () => {
    const { app, db, signUp, ban, bans } = await setup();
    const alice = await signUp("alice@example.com");
    expect((await ban(alice.userId)).status).toBe(204);

    const me = await app.request("/api/me", {
      headers: { authorization: `Bearer ${alice.token}` },
    });
    expect(me.status).toBe(401);
    expect(await count(db, "user")).toBe(1);
    expect(await count(db, "account")).toBe(0);
    expect(await bans()).toEqual([
      {
        userId: alice.userId,
        name: "alice@example.com",
        email: "alice@example.com",
        createdAt: expect.any(Number),
      },
    ]);
  });

  it("refuses a new sign-up with the banned email, leaving no rows", async () => {
    const { db, signUp, ban, googleSignIn } = await setup();
    await ban((await signUp("alice@example.com")).userId);
    const res = await googleSignIn("Alice@example.com");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "account_disabled" });
    expect(await count(db, "user")).toBe(1);
  });

  it("refuses the banned provider account under another email", async () => {
    const { db, limitCache, signUp, ban, googleSignIn } = await setup();
    await ban((await signUp("alice@example.com")).userId);
    // As if the provider account's email had changed: only its id matches.
    await db
      .deleteFrom("ban_key")
      .where("key", "=", emailBanKey("alice@example.com"))
      .execute();
    await limitCache.refresh();
    const res = await googleSignIn("alice@example.com");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "account_disabled" });
    expect(await count(db, "user")).toBe(1);
    expect(await count(db, "account")).toBe(0);
  });

  it("lets the account sign up again once unbanned", async () => {
    const { call, signUp, ban, bans, googleSignIn } = await setup();
    const alice = await signUp("alice@example.com");
    await ban(alice.userId);
    const unban = () =>
      call(`/api/admin/bans/${alice.userId}`, { method: "DELETE" });
    expect((await unban()).status).toBe(204);
    expect(await bans()).toEqual([]);
    expect((await googleSignIn("alice@example.com")).status).toBe(200);
    expect((await unban()).status).toBe(404);
  });

  it("doesn't ban the owner or someone else's sign-up", async () => {
    const { owner, signUp, ban, bans, googleSignIn } = await setup();
    expect((await ban(owner.userId)).status).toBe(400);
    expect((await ban("nobody")).status).toBe(404);
    await ban((await signUp("alice@example.com")).userId);
    expect(await bans()).toHaveLength(1);
    expect((await googleSignIn("bob@example.com")).status).toBe(200);
  });
});
