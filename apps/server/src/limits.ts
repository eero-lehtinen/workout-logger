import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { rateLimiter } from "hono-rate-limiter";
import type { AuthEnv } from "./auth/middleware.ts";

// docs/accounts.md#rate-limits-and-request-hygiene. In memory, which is
// enough for the single server instance.

/** Enough for several devices behind one NAT. */
export const IP_REQUESTS_PER_MINUTE = 300;
export const USER_REQUESTS_PER_MINUTE = 60;
/** Every `/api` request body but a push, which has its own limit. */
export const MAX_BODY_BYTES = 64 * 1024;

const MINUTE = 60 * 1000;

/**
 * Every request comes through the Cloudflare Tunnel, which sets
 * `CF-Connecting-IP` at the edge (docs/deployment.md#topology). Local runs
 * have only the socket.
 */
export function clientIp(c: Context): string {
  const header = c.req.header("cf-connecting-ip");
  if (header) return header;
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    // `app.request` in tests has no socket.
    return "unknown";
  }
}

/** Per client IP, before auth. Preflights are free: the browser sends them. */
export function ipLimit(): MiddlewareHandler {
  return rateLimiter({
    windowMs: MINUTE,
    limit: IP_REQUESTS_PER_MINUTE,
    keyGenerator: clientIp,
    skip: (c) => c.req.method === "OPTIONS",
    message: { error: "rate_limited" },
  });
}

/** Per signed-in user, after `requireUser`. The owner has no limit. */
export function userLimit(
  limitFor: (userId: string) => number | Promise<number> = () =>
    USER_REQUESTS_PER_MINUTE,
): MiddlewareHandler<AuthEnv> {
  return rateLimiter<AuthEnv>({
    windowMs: MINUTE,
    limit: (c) => limitFor(c.get("user").id),
    keyGenerator: (c) => c.get("user").id,
    skip: (c) => c.get("user").role === "owner",
    message: { error: "rate_limited" },
  });
}

/** 413 for a body over `maxSize`. */
export function requestBodyLimit(maxSize = MAX_BODY_BYTES): MiddlewareHandler {
  return bodyLimit({
    maxSize,
    onError: (c) => c.json({ error: "too_large" }, 413),
  });
}
