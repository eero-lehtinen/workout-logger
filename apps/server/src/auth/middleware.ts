import { compareVersions, validate } from "compare-versions";
import type { MiddlewareHandler } from "hono";
import { type Auth, type SessionUser, sessionUser } from "./auth.ts";

export type AuthEnv = { Variables: { user: SessionUser } };

/** 401 without a session cookie or bearer token; sets `user` otherwise. */
export function requireUser(auth: Auth): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const user = await sessionUser(auth, c.req.raw.headers);
    if (!user) return c.json({ error: "unauthorized" }, 401);
    c.set("user", user);
    await next();
  };
}

export const CLIENT_VERSION_HEADER = "X-Client-Version";

/**
 * 426 for an Android app older than `minimum`. The web app sends no version:
 * it is served by this server, and a stale PWA is caught by its update
 * prompt and by the per-change schema guard. Local builds (0.0.0) pass.
 */
export function requireClientVersion(
  minimum: string | undefined,
): MiddlewareHandler {
  return async (c, next) => {
    const version = c.req.header(CLIENT_VERSION_HEADER);
    if (
      minimum &&
      version &&
      validate(version) &&
      !version.startsWith("0.0.0") &&
      compareVersions(version, minimum) < 0
    ) {
      return c.json({ error: "update_required", minimum }, 426);
    }
    await next();
  };
}
