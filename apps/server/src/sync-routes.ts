import { EXPECTED_USER_HEADER } from "@workout-logger/core";
import {
  MAX_PULL_LIMIT,
  type PushRequest,
  pull,
  push,
  type ServerDb,
  snapshot,
} from "@workout-logger/core/sync-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AuthEnv } from "./auth/middleware.ts";

const MAX_PUSH_BYTES = 1024 * 1024;
const MAX_PUSH_CHANGES = 1000;
const DEVICE_ID_PATTERN = /^[0-9a-z]{1,16}$/;

/**
 * `/api/sync/v1`, behind `requireUser`. Every call goes through the shared
 * sync module with the signed-in user's id (docs/sync.md#server-side).
 */
export function syncRoutes(db: ServerDb, now: () => number = Date.now) {
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

  app.post(
    "/push",
    bodyLimit({
      maxSize: MAX_PUSH_BYTES,
      onError: (c) => c.json({ error: "too_large" }, 413),
    }),
    async (c) => {
      const body = await c.req.json().catch(() => null);
      if (!isPushRequest(body)) return c.json({ error: "invalid" }, 400);
      const { inserted: _, ...response } = await push(
        db,
        c.get("user").id,
        body,
        { now: now() },
      );
      return c.json(response);
    },
  );

  app.get("/pull", async (c) => {
    const after = Number(c.req.query("after") ?? 0);
    const limit = Number(c.req.query("limit") ?? MAX_PULL_LIMIT);
    if (!Number.isSafeInteger(after) || after < 0 || !Number.isFinite(limit)) {
      return c.json({ error: "invalid" }, 400);
    }
    return c.json(await pull(db, c.get("user").id, after, limit));
  });

  app.get("/snapshot", async (c) =>
    c.json(await snapshot(db, c.get("user").id)),
  );

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
