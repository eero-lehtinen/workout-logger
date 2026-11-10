import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createOwner } from "../cli.ts";
import { openTestApp } from "../testing.ts";
import { challengeOf } from "./native-auth.ts";

const verifier = randomBytes(32).toString("base64url");
const challenge = challengeOf(verifier);
const APP = "fi.eerolehtinen.lift";

describe("GitHub sign-in", () => {
  it("is the only sign-in method", async () => {
    const { app } = await openTestApp();
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@example.com", password: "password1" }),
    });
    expect(res.status).toBe(400);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("starts at GitHub", async () => {
    const { app } = await openTestApp();
    const res = await app.request("/api/auth/sign-in/social", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ provider: "github", callbackURL: "/settings" }),
    });
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(new URL(url).host).toBe("github.com");
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

describe("Android sign-in", () => {
  it("sends the Custom Tab to GitHub", async () => {
    const { app } = await openTestApp();
    const res = await app.request(
      `/api/native-auth/start?app=${APP}&challenge=${challenge}`,
    );
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location") ?? "").host).toBe("github.com");
    expect(res.headers.getSetCookie().length).toBeGreaterThan(0);
  });

  it.each([
    ["an unknown app", `app=com.evil&challenge=${challenge}`],
    ["a bad challenge", `app=${APP}&challenge=short`],
  ])("refuses %s", async (_, query) => {
    const { app } = await openTestApp();
    const res = await app.request(`/api/native-auth/start?${query}`);
    expect(res.status).toBe(400);
  });

  /**
   * `/start`, then GitHub (a new session), then `/finish` in the same tab.
   * `started: false` skips `/start`; `oldSession` signs in before it.
   */
  async function finish({ started = true, oldSession = false } = {}) {
    const test = await openTestApp();
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
      `/api/native-auth/finish?app=${APP}&challenge=${challenge}`,
      { headers: { authorization: `Bearer ${browser.token}`, cookie } },
    );
    const page = await res.text();
    const link = page.match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
    const code = new URL(link ?? "x:").searchParams.get("code");
    return { ...test, browser, link, code };
  }

  it("hands the app a code through its deep link", async () => {
    const { link, code } = await finish();
    expect(link).toMatch(new RegExp(`^${APP}://auth\\?code=`));
    expect(code).toBeTruthy();
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
