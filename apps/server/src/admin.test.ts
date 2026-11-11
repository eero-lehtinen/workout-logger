import type { PushResponse } from "@workout-logger/core";
import { formatHlc, SCHEMA_VERSION } from "@workout-logger/core";
import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import type { AdminUsers } from "./admin.ts";
import { DEFAULT_QUOTA, EXEMPTION_MS } from "./quota.ts";
import { openTestApp } from "./testing.ts";

const DAY = 24 * 60 * 60 * 1000;
const LATER = Date.now() + 2 * DAY;

async function setup() {
  const test = await openTestApp({ now: () => LATER });
  const owner = await test.signIn("owner@example.com", "owner");
  const alice = await test.signIn("alice@example.com");
  const call = (
    user: { token: string; userId: string },
    path: string,
    init: RequestInit = {},
  ) =>
    test.app.request(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${user.token}`,
        "x-expected-user": user.userId,
      },
    });
  const push = async (
    user: { token: string; userId: string },
    bytes: number,
  ) => {
    const res = await call(user, "/api/sync/v1/push", {
      method: "POST",
      body: JSON.stringify({
        device_id: "aaaaaaaaaaaa",
        client_version: "test",
        changes: [
          {
            table: "setting",
            id: `s${bytes}`,
            hlc: formatHlc({
              wall: Date.now(),
              counter: 0,
              node: "aaaaaaaaaaaa",
            }),
            deleted: false,
            v: SCHEMA_VERSION,
            data: { value_json: "x".repeat(bytes - 17) },
          },
        ],
      }),
    });
    return ((await res.json()) as PushResponse).results[0];
  };
  return { ...test, owner, alice, call, push };
}

describe("/api/admin", () => {
  it("refuses anyone but the owner", async () => {
    const { app, alice, call } = await setup();
    expect((await app.request("/api/admin/users")).status).toBe(401);
    expect((await call(alice, "/api/admin/users")).status).toBe(403);
    const res = await call(alice, `/api/admin/users/${alice.userId}/exempt`, {
      method: "POST",
    });
    expect(res.status).toBe(403);
  });

  it("lists every user with their usage", async () => {
    const { owner, alice, call, push } = await setup();
    expect(await push(alice, 100)).toEqual({ status: "ok" });
    const body = (await (
      await call(owner, "/api/admin/users")
    ).json()) as AdminUsers;
    expect(body.defaults).toEqual(DEFAULT_QUOTA);
    expect(body).toMatchObject({ maxAccounts: null, defaultMaxAccounts: 100 });
    expect(body.users.map((u) => u.email)).toEqual([
      "owner@example.com",
      "alice@example.com",
    ]);
    expect(body.users[1]).toMatchObject({
      id: alice.userId,
      role: "user",
      disabled: false,
      bytesWrittenToday: 100,
      storedBytes: 100,
      lastSyncAt: LATER,
      exemptUntil: null,
      overrides: {
        bytesPerDay: null,
        maxBytes: null,
        requestsPerMinute: null,
        snapshotsPerDay: null,
      },
    });
    expect(body.users[1]?.createdAt).toBeLessThan(LATER);
  });

  it("sets quota overrides", async () => {
    const { owner, alice, call, push } = await setup();
    const put = (body: unknown) =>
      call(owner, `/api/admin/users/${alice.userId}/quota`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    const overrides = {
      bytesPerDay: 50,
      maxBytes: null,
      requestsPerMinute: 30,
      snapshotsPerDay: null,
    };
    expect((await put(overrides)).status).toBe(204);
    expect(await push(alice, 100)).toEqual({
      status: "rejected",
      reason: "quota",
    });
    const { users } = (await (
      await call(owner, "/api/admin/users")
    ).json()) as AdminUsers;
    expect(users[1]?.overrides).toEqual(overrides);
    for (const bad of [{}, { ...overrides, maxBytes: -1 }, "x"]) {
      expect((await put(bad)).status).toBe(400);
    }
  });

  it("applies a request limit override at once", async () => {
    const { owner, alice, call } = await setup();
    await call(owner, `/api/admin/users/${alice.userId}/quota`, {
      method: "PUT",
      body: JSON.stringify({
        bytesPerDay: null,
        maxBytes: null,
        requestsPerMinute: 1,
        snapshotsPerDay: null,
      }),
    });
    expect((await call(alice, "/api/me")).status).toBe(200);
    expect((await call(alice, "/api/me")).status).toBe(429);
  });

  it("sets the account cap, or clears it to the default", async () => {
    const { owner, call, limitCache } = await setup();
    const put = (maxAccounts: unknown) =>
      call(owner, "/api/admin/limits", {
        method: "PUT",
        body: JSON.stringify({ maxAccounts }),
      });
    expect((await put(1)).status).toBe(204);
    expect(limitCache.maxAccounts()).toBe(1);
    const body = (await (
      await call(owner, "/api/admin/users")
    ).json()) as AdminUsers;
    expect(body.maxAccounts).toBe(1);
    expect((await put(null)).status).toBe(204);
    expect(limitCache.maxAccounts()).toBe(100);
    for (const bad of [0, -1, 2.5, "5"]) {
      expect((await put(bad)).status).toBe(400);
    }
  });

  it("lifts the daily limit for 24 h", async () => {
    const { owner, alice, call, push } = await setup();
    await call(owner, `/api/admin/users/${alice.userId}/quota`, {
      method: "PUT",
      body: JSON.stringify({
        bytesPerDay: 0,
        maxBytes: null,
        requestsPerMinute: null,
        snapshotsPerDay: null,
      }),
    });
    expect((await push(alice, 100))?.status).toBe("rejected");
    const res = await call(owner, `/api/admin/users/${alice.userId}/exempt`, {
      method: "POST",
    });
    expect(await res.json()).toEqual({ exemptUntil: LATER + EXEMPTION_MS });
    expect(await push(alice, 100)).toEqual({ status: "ok" });
  });

  it("doesn't act on the owner's own account or a missing one", async () => {
    const { owner, call } = await setup();
    const own = await call(owner, `/api/admin/users/${owner.userId}/disable`, {
      method: "POST",
    });
    expect(own.status).toBe(400);
    const missing = await call(owner, "/api/admin/users/nobody/disable", {
      method: "POST",
    });
    expect(missing.status).toBe(404);
  });
});

describe("disabling an account", () => {
  it("ends its sessions and refuses new ones until enabled", async () => {
    const { owner, alice, auth, call } = await setup();
    const res = await call(owner, `/api/admin/users/${alice.userId}/disable`, {
      method: "POST",
    });
    expect(res.status).toBe(204);
    expect((await call(alice, "/api/me")).status).toBe(401);

    const ctx = await auth.$context;
    await expect(
      ctx.internalAdapter.createSession(alice.userId),
    ).rejects.toMatchObject({ body: { code: "account_disabled" } });

    await call(owner, `/api/admin/users/${alice.userId}/enable`, {
      method: "POST",
    });
    const session = await ctx.internalAdapter.createSession(alice.userId);
    expect(session.userId).toBe(alice.userId);
  });

  it("answers 403 to a session that outlived the disable", async () => {
    const { db, alice, call } = await setup();
    await sql`UPDATE user SET disabled = 1 WHERE id = ${alice.userId}`.execute(
      db,
    );
    const res = await call(alice, "/api/me");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "account_disabled" });
  });
});
