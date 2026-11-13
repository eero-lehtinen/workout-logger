import { describe, expect, it } from "vitest";
import { APP_IDS } from "./auth/native-auth.ts";
import {
  IP_REQUESTS_PER_MINUTE,
  MAX_BODY_BYTES,
  SIGN_IN_STARTS_PER_MINUTE,
  USER_REQUESTS_PER_MINUTE,
} from "./limits.ts";
import { openTestApp } from "./testing.ts";

describe("per-IP limit", () => {
  it("answers 429 with Retry-After once an IP is over the limit", async () => {
    const { app } = await openTestApp();
    const from = (ip: string) =>
      app.request("/api/status", { headers: { "cf-connecting-ip": ip } });
    for (let i = 0; i < IP_REQUESTS_PER_MINUTE; i++) {
      expect((await from("203.0.113.1")).status).toBe(200);
    }
    const over = await from("203.0.113.1");
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({ error: "rate_limited" });
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await from("203.0.113.2")).status).toBe(200);
  });

  it("doesn't count preflights or static files", async () => {
    const { app } = await openTestApp();
    const headers = { "cf-connecting-ip": "203.0.113.1" };
    for (let i = 0; i < IP_REQUESTS_PER_MINUTE; i++) {
      await app.request("/api/status", {
        method: "OPTIONS",
        headers: {
          ...headers,
          origin: "https://localhost",
          "access-control-request-method": "GET",
        },
      });
      await app.request("/index.html", { headers });
    }
    expect((await app.request("/api/status", { headers })).status).toBe(200);
  });

  it("counts an IPv6 /64 as one client", async () => {
    const { app } = await openTestApp();
    const from = (ip: string) =>
      app.request("/api/status", { headers: { "cf-connecting-ip": ip } });
    for (let i = 0; i < IP_REQUESTS_PER_MINUTE; i++) {
      expect((await from(`2001:db8:0:1::${i.toString(16)}`)).status).toBe(200);
    }
    expect((await from("2001:db8:0:1:ffff::1")).status).toBe(429);
    expect((await from("2001:db8:0:2::1")).status).toBe(200);
  });
});

describe("Android sign-in start", () => {
  it("limits each IP, as Better Auth limits its sign-in", async () => {
    const { app } = await openTestApp();
    const appId = [...APP_IDS][0];
    const start = (ip: string) =>
      app.request(
        `/api/native-auth/start?app=${appId}&challenge=${"a".repeat(43)}`,
        { headers: { "cf-connecting-ip": ip } },
      );
    for (let i = 0; i < SIGN_IN_STARTS_PER_MINUTE; i++) {
      expect((await start("203.0.113.1")).status).toBe(302);
    }
    expect((await start("203.0.113.1")).status).toBe(429);
    expect((await start("203.0.113.2")).status).toBe(302);
  });
});

describe("per-user limit", () => {
  it("limits each user, and not the owner", async () => {
    const { app, signIn } = await openTestApp();
    const alice = await signIn("alice@example.com");
    const bob = await signIn("bob@example.com");
    const owner = await signIn("owner@example.com", "owner");
    let ip = 0;
    const me = (token: string) =>
      // A new IP each time, so only the user limit applies.
      app.request("/api/me", {
        headers: {
          authorization: `Bearer ${token}`,
          "cf-connecting-ip": `ip-${ip++}`,
        },
      });
    for (let i = 0; i < USER_REQUESTS_PER_MINUTE; i++) {
      expect((await me(alice.token)).status).toBe(200);
    }
    const over = await me(alice.token);
    expect(over.status).toBe(429);
    expect(over.headers.get("retry-after")).toBeTruthy();
    expect((await me(bob.token)).status).toBe(200);
    for (let i = 0; i <= USER_REQUESTS_PER_MINUTE; i++) {
      expect((await me(owner.token)).status).toBe(200);
    }
  });
});

describe("body limits", () => {
  const post = (
    app: Awaited<ReturnType<typeof openTestApp>>["app"],
    path: string,
    bytes: number,
  ) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "x".repeat(bytes) }),
    });

  it("refuses a body over 64 KB outside push", async () => {
    const { app } = await openTestApp();
    for (const path of ["/api/native-auth/exchange", "/api/auth/sign-out"]) {
      expect((await post(app, path, MAX_BODY_BYTES)).status).toBe(413);
    }
    expect((await post(app, "/api/native-auth/exchange", 1000)).status).toBe(
      400,
    );
  });

  it("lets a push be up to 1 MB", async () => {
    const { app, signIn } = await openTestApp();
    const { token, userId } = await signIn("alice@example.com");
    const res = await app.request("/api/sync/v1/push", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-expected-user": userId,
      },
      body: JSON.stringify({
        device_id: "aaaaaaaaaaaa",
        client_version: "test",
        changes: [],
        padding: "x".repeat(MAX_BODY_BYTES * 2),
      }),
    });
    expect(res.status).toBe(200);
  });
});
