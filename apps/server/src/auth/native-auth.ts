import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { type Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { html, raw } from "hono/html";
import { type Auth, type SignInProvider, signInProviders } from "./auth.ts";

/**
 * Sign-in for the Android app (docs/accounts.md#login, Android sessions).
 *
 * The app's WebView can't host the OAuth flow: the provider's callback would
 * leave the app's origin, and Google refuses WebViews. The app opens `/start` in a Custom Tab instead.
 * Better Auth runs the usual flow there and lands on `/finish`, which
 * creates a separate session for the app, ends the tab's own session, and
 * hands the app a one-time code through its deep link. The app trades the
 * code for its bearer token at `/exchange`, proving with a PKCE-style
 * verifier that it started the flow; another app that registers the same
 * scheme can intercept the code but can't redeem it.
 */

/** Deep-link schemes, one per Android build (docs/architecture.md#app-shell). */
export const APP_IDS = new Set([
  "fi.eerolehtinen.lift",
  "fi.eerolehtinen.lift.debug",
]);

const CODE_TTL_MS = 2 * 60 * 1000;
/** Ties `/finish` to a flow this browser started, and when. */
const FLOW_COOKIE = "wl_native_auth";
const FLOW_TTL_S = 10 * 60;
/** base64url of a SHA-256 digest. */
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

interface PendingCode {
  token: string;
  challenge: string;
  expiresAt: number;
}

export function challengeOf(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function nativeAuthRoutes(auth: Auth, now: () => number = Date.now) {
  // In memory: there is one server instance, and a code lives two minutes.
  const codes = new Map<string, PendingCode>();
  const app = new Hono();

  app.get("/start", async (c) => {
    const params = flowParams(c);
    const provider = startProvider(auth, c.req.query("provider"));
    if (!params || !provider) return c.text("Bad request", 400);
    const query = new URLSearchParams(params).toString();
    const { headers, response } = await auth.api.signInSocial({
      body: {
        provider,
        callbackURL: `/api/native-auth/finish?${query}`,
        errorCallbackURL: `/api/native-auth/finish?${query}`,
        disableRedirect: true,
      },
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    if (!response.url) return c.text("Sign-in is not available", 503);
    setCookie(c, FLOW_COOKIE, `${params.challenge}.${now()}`, {
      path: "/api/native-auth",
      httpOnly: true,
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Lax",
      maxAge: FLOW_TTL_S,
    });
    const res = c.redirect(response.url, 302);
    for (const cookie of headers.getSetCookie()) {
      res.headers.append("Set-Cookie", cookie);
    }
    return res;
  });

  app.get("/finish", async (c) => {
    const params = flowParams(c);
    if (!params) return c.text("Bad request", 400);
    const back = new URL(`${params.app}://auth`);
    const [challenge, startedAt] = (getCookie(c, FLOW_COOKIE) ?? "").split(".");
    deleteCookie(c, FLOW_COOKIE, { path: "/api/native-auth" });
    const error = c.req.query("error");
    const session = error
      ? null
      : await auth.api.getSession({ headers: c.req.raw.headers });
    // Without these, a link to /finish could hand a session that existed
    // before (e.g. the browser's own web session) to whoever holds the
    // challenge's verifier.
    const fresh =
      challenge === params.challenge &&
      session !== null &&
      // A second of slack for timestamps stored without milliseconds.
      session.session.createdAt.getTime() >= Number(startedAt) - 1000;
    if (!session || !fresh) {
      back.searchParams.set("error", error ?? "no_session");
      return returnPage(c, back, null);
    }
    const ctx = await auth.$context;
    const appSession = await ctx.internalAdapter.createSession(session.user.id);
    for (const [code, pending] of codes) {
      if (pending.expiresAt <= now()) codes.delete(code);
    }
    const code = randomBytes(32).toString("base64url");
    codes.set(code, {
      token: appSession.token,
      challenge: params.challenge,
      expiresAt: now() + CODE_TTL_MS,
    });
    back.searchParams.set("code", code);
    // The tab's session would otherwise stay signed in in the phone's browser.
    const signOut = (await auth.api.signOut({
      headers: c.req.raw.headers,
      asResponse: true,
    })) as Response;
    return returnPage(c, back, signOut.headers);
  });

  app.post("/exchange", async (c) => {
    const body = await c.req.json().catch(() => null);
    const code = typeof body?.code === "string" ? body.code : "";
    const verifier = typeof body?.verifier === "string" ? body.verifier : "";
    const pending = codes.get(code);
    codes.delete(code);
    if (
      !pending ||
      pending.expiresAt <= now() ||
      !VERIFIER_PATTERN.test(verifier) ||
      !sameText(challengeOf(verifier), pending.challenge)
    ) {
      return c.json({ error: "invalid_code" }, 400);
    }
    return c.json({ token: pending.token });
  });

  /** Ends the app's session; the token stops working everywhere. */
  app.post("/sign-out", async (c) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.toLowerCase().startsWith("bearer ")
      ? header.slice(7).trim().split(".")[0]
      : "";
    if (token) {
      const ctx = await auth.$context;
      await ctx.internalAdapter.deleteSession(token);
    }
    return c.body(null, 204);
  });

  return app;
}

function flowParams(c: Context): { app: string; challenge: string } | null {
  const app = c.req.query("app") ?? "";
  const challenge = c.req.query("challenge") ?? "";
  if (!APP_IDS.has(app) || !CHALLENGE_PATTERN.test(challenge)) return null;
  return { app, challenge };
}

/** An enabled provider. Without one named, the first: older web builds send none. */
function startProvider(
  auth: Auth,
  name: string | undefined,
): SignInProvider | null {
  const enabled = signInProviders(auth);
  if (name === undefined) return enabled[0] ?? null;
  return enabled.find((provider) => provider === name) ?? null;
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Chrome may refuse to open an app from a redirect that no tap started, e.g.
 * when the provider skips its consent screen. The page tries on load and offers a
 * button that works either way.
 */
function returnPage(c: Context, back: URL, headers: Headers | null) {
  const target = back.toString();
  for (const cookie of headers?.getSetCookie() ?? []) {
    c.header("Set-Cookie", cookie, { append: true });
  }
  return c.html(html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Back to the app</title>
        <style>
          body { font: 16px system-ui, sans-serif; display: grid; place-items: center; min-height: 90vh; margin: 0; }
          a { padding: 12px 20px; border-radius: 10px; background: #1b2226; color: #fff; text-decoration: none; }
        </style>
      </head>
      <body>
        <a href="${target}">Return to the app</a>
        <script>location.replace(${raw(JSON.stringify(target).replaceAll("<", "\\u003c"))});</script>
      </body>
    </html>`);
}
