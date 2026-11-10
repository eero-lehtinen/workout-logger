import type { Change, PushResponse } from "@workout-logger/core";
import { formatHlc, SCHEMA_VERSION } from "@workout-logger/core";
import { describe, expect, it } from "vitest";
import { openTestApp } from "./testing.ts";

const T0 = 1_700_000_000_000;

function change(id: string, value: string): Change {
  return {
    table: "setting",
    id,
    hlc: formatHlc({ wall: T0, counter: 0, node: "aaaaaaaaaaaa" }),
    deleted: false,
    v: SCHEMA_VERSION,
    data: { value_json: value },
  };
}

function pushBody(changes: Change[]) {
  return JSON.stringify({
    device_id: "aaaaaaaaaaaa",
    client_version: "test",
    changes,
  });
}

async function setup(minClientVersion?: string) {
  const test = await openTestApp({ now: () => T0, minClientVersion });
  const alice = await test.signIn("alice@example.com");
  const bob = await test.signIn("bob@example.com");
  const users = new Map([
    [alice.token, alice.userId],
    [bob.token, bob.userId],
  ]);
  const call = (path: string, token: string | null, init: RequestInit = {}) =>
    test.app.request(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token
          ? {
              authorization: `Bearer ${token}`,
              "x-expected-user": users.get(token) ?? "",
            }
          : {}),
        ...init.headers,
      },
    });
  return { ...test, alice, bob, call };
}

describe("/api/sync/v1", () => {
  it("needs a session", async () => {
    const { call } = await setup();
    for (const path of [
      "/api/sync/v1/pull",
      "/api/sync/v1/snapshot",
      "/api/me",
    ]) {
      expect((await call(path, null)).status).toBe(401);
    }
    const res = await call("/api/sync/v1/push", "not-a-token", {
      method: "POST",
      body: pushBody([]),
    });
    expect(res.status).toBe(401);
  });

  it("pushes, pulls, and snapshots one user's rows only", async () => {
    const { call, alice, bob } = await setup();
    const res = await call("/api/sync/v1/push", alice.token, {
      method: "POST",
      body: pushBody([change("unit", '"kg"')]),
    });
    expect(res.status).toBe(200);
    const pushed = (await res.json()) as PushResponse;
    expect(pushed.results).toEqual([{ status: "ok" }]);

    const pulled = await (
      await call("/api/sync/v1/pull?after=0", alice.token)
    ).json();
    expect(pulled).toMatchObject({
      epoch: pushed.epoch,
      changes: [{ id: "unit", seq: 1 }],
      more: false,
    });
    const snapshot = await (
      await call("/api/sync/v1/snapshot", alice.token)
    ).json();
    expect(snapshot).toMatchObject({ changes: [{ id: "unit" }], cursor: 1 });

    expect(
      await (await call("/api/sync/v1/pull?after=0", bob.token)).json(),
    ).toMatchObject({ changes: [] });
  });

  it("refuses a session of another account than expected", async () => {
    const { call, alice, bob } = await setup();
    for (const expected of [bob.userId, ""]) {
      const res = await call("/api/sync/v1/pull", alice.token, {
        headers: { "x-expected-user": expected },
      });
      expect(res.status).toBe(409);
    }
  });

  it("rejects a malformed push", async () => {
    const { call, alice } = await setup();
    for (const body of ["nope", "{}", pushBody([null as never])]) {
      const res = await call("/api/sync/v1/push", alice.token, {
        method: "POST",
        body,
      });
      expect(res.status).toBe(400);
    }
  });

  it("refuses a push over 1 MB", async () => {
    const { call, alice } = await setup();
    const res = await call("/api/sync/v1/push", alice.token, {
      method: "POST",
      body: pushBody([change("big", "x".repeat(1024 * 1024))]),
    });
    expect(res.status).toBe(413);
  });

  it("asks an outdated Android app to update", async () => {
    const { call, alice } = await setup("1.2.0");
    const old = await call("/api/sync/v1/pull", alice.token, {
      headers: { "x-client-version": "1.1.9" },
    });
    expect(old.status).toBe(426);
    for (const version of ["1.2.0", "0.0.0-debug"]) {
      const res = await call("/api/sync/v1/pull", alice.token, {
        headers: { "x-client-version": version },
      });
      expect(res.status).toBe(200);
    }
    // The web app sends no version.
    expect((await call("/api/sync/v1/pull", alice.token)).status).toBe(200);
  });

  it("answers the Android app's preflight", async () => {
    const { app } = await setup();
    const res = await app.request("/api/sync/v1/push", {
      method: "OPTIONS",
      headers: {
        origin: "https://localhost",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://localhost",
    );
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });
});

describe("/api/me", () => {
  it("returns the signed-in user", async () => {
    const { call, alice } = await setup();
    const res = await call("/api/me", alice.token);
    expect(await res.json()).toEqual({
      id: alice.userId,
      name: "alice@example.com",
      email: "alice@example.com",
      image: null,
      role: "user",
    });
  });
});
