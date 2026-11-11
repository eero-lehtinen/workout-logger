import { EXPECTED_USER_HEADER, MAX_PUSH_BYTES } from "@workout-logger/core";
import {
  MAX_PULL_LIMIT,
  type PushRequest,
  pull,
  push,
  snapshot,
} from "@workout-logger/core/sync-server";
import { Hono } from "hono";
import type { AuthEnv } from "./auth/middleware.ts";
import { type ServerKysely, syncDb } from "./db/database.ts";
import { requestBodyLimit } from "./limits.ts";
import { pushQuota, takeSnapshot } from "./quota.ts";

/** Its body limit is `MAX_PUSH_BYTES`, not the general one. */
export const PUSH_PATH = "/api/sync/v1/push";
const MAX_PUSH_CHANGES = 1000;
const DEVICE_ID_PATTERN = /^[0-9a-z]{1,16}$/;

/**
 * `/api/sync/v1`, behind `requireUser`. Every call goes through the shared
 * sync module with the signed-in user's id (docs/sync.md#server-side).
 */
export function syncRoutes(
  serverDb: ServerKysely,
  now: () => number = Date.now,
) {
  const db = syncDb(serverDb);
  const app = new Hono<AuthEnv>();

  // The client names the account its data belongs to. A session of another
  // account, e.g. after a sign-in in another tab, would otherwise mix two
  // accounts' data.
  app.use(async (c, next) => {
    if (c.req.header(EXPECTED_USER_HEADER) !== c.get("user").id) {
      return c.json({ error: "account_changed" }, 409);
    }
    await next();
  });

  app.post("/push", requestBodyLimit(MAX_PUSH_BYTES), async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!isPushRequest(body)) return c.json({ error: "invalid" }, 400);
    const userId = c.get("user").id;
    const at = now();
    const { inserted: _, ...response } = await push(db, userId, body, {
      now: at,
      quota: pushQuota(userId, at),
    });
    return c.json(response);
  });

  app.get("/pull", async (c) => {
    const after = Number(c.req.query("after") ?? 0);
    const limit = Number(c.req.query("limit") ?? MAX_PULL_LIMIT);
    if (!Number.isSafeInteger(after) || after < 0 || !Number.isFinite(limit)) {
      return c.json({ error: "invalid" }, 400);
    }
    return c.json(await pull(db, c.get("user").id, after, limit));
  });

  app.get("/snapshot", async (c) => {
    const userId = c.get("user").id;
    if (!(await takeSnapshot(serverDb, userId, now()))) {
      return c.json({ error: "quota" }, 429);
    }
    return c.json(await snapshot(db, userId));
  });

  return app;
}

/** The envelope. Each change is validated by `push`, which rejects it alone. */
function isPushRequest(body: unknown): body is PushRequest {
  if (typeof body !== "object" || body === null) return false;
  const { device_id, client_version, changes } = body as Record<
    string,
    unknown
  >;
  return (
    typeof device_id === "string" &&
    DEVICE_ID_PATTERN.test(device_id) &&
    typeof client_version === "string" &&
    client_version.length <= 64 &&
    Array.isArray(changes) &&
    changes.length <= MAX_PUSH_CHANGES &&
    changes.every((change) => typeof change === "object" && change !== null)
  );
}
