import { randomBytes } from "node:crypto";
import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { createOwner, setEmail } from "../cli.ts";
import { openTestApp } from "../testing.ts";
import { pruneVerifications } from "./auth.ts";
import { challengeOf } from "./native-auth.ts";

const verifier = randomBytes(32).toString("base64url");
const challenge = challengeOf(verifier);
const APP = "fi.eerolehtinen.lift";

async function startSocial(
  app: Awaited<ReturnType<typeof openTestApp>>["app"],
  provider: string,
) {
  return app.request("/api/auth/sign-in/social", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify({ provider, callbackURL: "/settings" }),
  });
}

describe("sign-in", () => {
  it("has no passwords", async () => {
    const { app } = await openTestApp();
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@example.com", password: "password1" }),
    });
    expect(res.status).toBe(400);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("starts at Google with the account chooser", async () => {
    const { app } = await openTestApp();
    const res = await startSocial(app, "google");
    expect(res.status).toBe(200);
    const url = new URL(((await res.json()) as { url: string }).url);
    expect(url.host).toBe("accounts.google.com");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual([
      "email",
      "openid",
      "profile",
    ]);
  });

  it("starts at GitHub when it is enabled", async () => {
    const { app } = await openTestApp();
    const res = await startSocial(app, "github");
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(new URL(url).host).toBe("github.com");
  });

  it("refuses a provider that isn't enabled", async () => {
    const { app } = await openTestApp({
      signIn: { google: { clientId: "id", clientSecret: "secret" } },
    });
    expect((await startSocial(app, "github")).ok).toBe(false);
  });

  it("lists the enabled providers in /api/status", async () => {
    const both = await openTestApp();
    expect(await (await both.app.request("/api/status")).json()).toMatchObject({
      signIn: ["google", "github"],
    });
    const none = await openTestApp({ signIn: {} });
    expect(await (await none.app.request("/api/status")).json()).toMatchObject({
      signIn: [],
    });
  });
});

describe("create-owner", () => {
  it("creates one owner with a verified email", async () => {
    const { auth } = await openTestApp();
    await createOwner(auth, "Owner@Example.com", "Owner");
    const ctx = await auth.$context;
    const owner =
      await ctx.internalAdapter.findUserByEmail("owner@example.com");
    expect(owner?.user).toMatchObject({ role: "owner", emailVerified: true });
    await expect(createOwner(auth, "other@example.com", "x")).rejects.toThrow(
      "an owner already exists",
    );
  });
});

describe("set-email", () => {
  it("changes an account's email, marked verified", async () => {
    const { auth, signIn } = await openTestApp();
    const { userId } = await signIn("old@example.com");
    expect(await setEmail(auth, "old@example.com", "New@Example.com")).toBe(
      userId,
    );
    const ctx = await auth.$context;
    expect(await ctx.internalAdapter.findUserById(userId)).toMatchObject({
      email: "new@example.com",
      emailVerified: true,
    });
    await setEmail(auth, userId, "newer@example.com");
    expect(
      (await ctx.internalAdapter.findUserByEmail("newer@example.com"))?.user.id,
    ).toBe(userId);
  });

  it("refuses an email another account has", async () => {
    const { auth, signIn } = await openTestApp();
    await signIn("a@example.com");
    await signIn("b@example.com");
    await expect(
      setEmail(auth, "a@example.com", "b@example.com"),
    ).rejects.toThrow("another account already has b@example.com");
    await expect(setEmail(auth, "nobody", "c@example.com")).rejects.toThrow(
      "no account nobody",
    );
  });
});

describe("deleting a user", () => {
  it("deletes the user's sessions", async () => {
    const { db, signIn } = await openTestApp();
    const { userId } = await signIn("alice@example.com");
    await sql`delete from user where id = ${userId}`.execute(db);
    const { rows } = await sql<{
      n: number;
    }>`select count(*) as n from session where userId = ${userId}`.execute(db);
    expect(rows[0]?.n).toBe(0);
  });
});

describe("cookies over https", () => {
  /** What a sibling subdomain can't set: `__Host-`, Secure, Path=/, no Domain. */
  const hostOnly = (cookie: string) =>
    cookie.startsWith("__Host-") &&
    /; Secure/i.test(cookie) &&
    /; Path=\/(;|$)/i.test(cookie) &&
    !/; Domain=/i.test(cookie);

  it("names Better Auth's cookies __Host-", async () => {
    const { auth } = await openTestApp({ publicUrl: "https://lift.example" });
    const { sessionToken } = (await auth.$context).authCookies;
    expect(sessionToken.name).toBe("__Host-better-auth.session_token");
    expect(sessionToken.attributes).toMatchObject({ secure: true, path: "/" });
    expect(sessionToken.attributes.domain).toBeUndefined();
  });

  it("sets only __Host- cookies when the app starts a sign-in", async () => {
    const { app } = await openTestApp({ publicUrl: "https://lift.example" });
    const res = await app.request(
      `/api/native-auth/start?app=${APP}&challenge=${challenge}`,
    );
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("__Host-wl_native_auth="))).toBe(
      true,
    );
    expect(cookies.filter((c) => !hostOnly(c))).toEqual([]);
  });
});

describe("pruneVerifications", () => {
  it("deletes only expired verification rows", async () => {
    const { auth, db } = await openTestApp();
    const ctx = await auth.$context;
    const now = Date.now();
    for (const [identifier, offset] of [
      ["expired", -1000],
      ["live", 60_000],
    ] as const) {
      await ctx.internalAdapter.createVerificationValue({
        identifier,
        value: "state",
        expiresAt: new Date(now + offset),
      });
    }
    const count = async () =>
      (
        await sql<{
          n: number;
        }>`select count(*) as n from verification`.execute(db)
      ).rows[0]?.n;
    expect(await count()).toBe(2);
    await pruneVerifications(auth, now);
    expect(await count()).toBe(1);
    expect(
      await ctx.internalAdapter.findVerificationValue("live"),
    ).not.toBeNull();
  });
});

describe("Android sign-in", () => {
  it.each([
    ["google", "accounts.google.com"],
    ["github", "github.com"],
  ])("sends the Custom Tab to %s", async (provider, host) => {
    const { app } = await openTestApp();
    const res = await app.request(
      `/api/native-auth/start?app=${APP}&challenge=${challenge}&provider=${provider}`,
    );
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location") ?? "").host).toBe(host);
    expect(res.headers.getSetCookie().length).toBeGreaterThan(0);
  });

  it("uses the first enabled provider when none is named", async () => {
    const { app } = await openTestApp();
    const res = await app.request(
      `/api/native-auth/start?app=${APP}&challenge=${challenge}`,
    );
    expect(new URL(res.headers.get("location") ?? "").host).toBe(
      "accounts.google.com",
    );
  });

  it.each([
    ["an unknown app", `app=com.evil&challenge=${challenge}`],
    ["a bad challenge", `app=${APP}&challenge=short`],
    [
      "a provider that isn't enabled",
      `app=${APP}&challenge=${challenge}&provider=github`,
    ],
  ])("refuses %s", async (_, query) => {
    const { app } = await openTestApp({
      signIn: { google: { clientId: "id", clientSecret: "secret" } },
    });
    const res = await app.request(`/api/native-auth/start?${query}`);
    expect(res.status).toBe(400);
  });

  /**
   * `/start`, then GitHub (a new session), then `/finish` in the same tab.
   * `started: false` skips `/start`; `oldSession` signs in before it.
   */
  async function finish({
    started = true,
    oldSession = false,
    welcome = false,
    publicUrl = undefined as string | undefined,
  } = {}) {
    const test = await openTestApp(publicUrl ? { publicUrl } : {});
    const early = oldSession ? await test.signIn("alice@example.com") : null;
    if (oldSession) await new Promise((r) => setTimeout(r, 1100));
    const start = started
      ? await test.app.request(
          `/api/native-auth/start?app=${APP}&challenge=${challenge}`,
        )
      : null;
    const cookie = (start?.headers.getSetCookie() ?? [])
      .map((c) => c.split(";")[0])
      .join("; ");
    const browser = early ?? (await test.signIn("alice@example.com"));
    // After GitHub, Better Auth lands here with the tab's session.
    const res = await test.app.request(
      `/api/native-auth/finish?app=${APP}&challenge=${challenge}${welcome ? "&welcome=1" : ""}`,
      { headers: { authorization: `Bearer ${browser.token}`, cookie } },
    );
    const page = await res.text();
    const link = page.match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
    const code = new URL(link ?? "x:").searchParams.get("code");
    return { ...test, browser, link, code };
  }

  it("reads its __Host- flow cookie over https", async () => {
    const { code } = await finish({ publicUrl: "https://lift.example" });
    expect(code).toBeTruthy();
  });

  it("hands the app a code through its deep link", async () => {
    const { link, code } = await finish();
    expect(link).toMatch(new RegExp(`^${APP}://auth\\?code=`));
    expect(code).toBeTruthy();
  });

  it("tells the app about a sign-up, which Better Auth sends to the welcome URL", async () => {
    const { link } = await finish({ welcome: true });
    expect(new URL(link ?? "x:").searchParams.get("welcome")).toBe("1");
    expect(
      new URL((await finish()).link ?? "x:").searchParams.has("welcome"),
    ).toBe(false);
  });

  it("trades the code once, with the verifier, for a token of a new session", async () => {
    const { app, code, browser } = await finish();
    const exchange = (body: object) =>
      app.request("/api/native-auth/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const wrong = await exchange({
      code,
      verifier: randomBytes(32).toString("base64url"),
    });
    expect(wrong.status).toBe(400);

    const { app: again, code: code2 } = await finish();
    const ok = await again.request("/api/native-auth/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: code2, verifier }),
    });
    expect(ok.status).toBe(200);
    const { token } = (await ok.json()) as { token: string };
    expect(token).not.toBe(browser.token);

    const me = await again.request("/api/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(200);

    const reused = await again.request("/api/native-auth/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: code2, verifier }),
    });
    expect(reused.status).toBe(400);
  });

  it("ends the tab's own session", async () => {
    const { app, browser } = await finish();
    const me = await app.request("/api/me", {
      headers: { authorization: `Bearer ${browser.token}` },
    });
    expect(me.status).toBe(401);
  });

  it.each([
    ["without /start in the same browser", { started: false }],
    ["with a session from before /start", { oldSession: true }],
  ])("refuses to finish %s", async (_, options) => {
    const { link, code } = await finish(options);
    expect(code).toBeNull();
    expect(link).toBe(`${APP}://auth?error=no_session`);
  });

  it("passes a GitHub error back to the app", async () => {
    const { app } = await openTestApp();
    const res = await app.request(
      `/api/native-auth/finish?app=${APP}&challenge=${challenge}&error=access_denied`,
    );
    expect(await res.text()).toContain(`${APP}://auth?error=access_denied`);
  });

  it("revokes the app's token on sign-out", async () => {
    const { app, signIn } = await openTestApp();
    const { token } = await signIn("alice@example.com");
    const res = await app.request("/api/native-auth/sign-out", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(204);
    const me = await app.request("/api/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(401);
  });
});
