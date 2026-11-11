import { Hono } from "hono";
import { sql } from "kysely";
import { type AuthEnv, requireOwner } from "./auth/middleware.ts";
import type { ServerKysely } from "./db/database.ts";
import { DEFAULT_MAX_ACCOUNTS, type LimitCache } from "./limit-cache.ts";
import {
  DEFAULT_QUOTA,
  EXEMPTION_MS,
  readLimits,
  toMillis,
  utcDay,
} from "./quota.ts";

// The one module that reads across users, for the owner's admin page
// (docs/accounts.md#admin-page). Only `/api/admin/*` uses it, behind
// `requireOwner`.

/** The owner's overrides; null is the default. */
export interface QuotaOverrides {
  bytesPerDay: number | null;
  maxBytes: number | null;
  requestsPerMinute: number | null;
  snapshotsPerDay: number | null;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "owner" | "user";
  createdAt: number;
  disabled: boolean;
  /** The newest `received_at` of the user's rows. */
  lastSyncAt: number | null;
  bytesWrittenToday: number;
  storedBytes: number;
  overrides: QuotaOverrides;
  /** The end of the exemption from the daily write limit in force, if any. */
  exemptUntil: number | null;
}

export interface AdminUsers {
  users: AdminUser[];
  defaults: typeof DEFAULT_QUOTA;
  /** The owner's account cap; null is `defaultMaxAccounts`. */
  maxAccounts: number | null;
  defaultMaxAccounts: number;
}

const OVERRIDE_KEYS = [
  "bytesPerDay",
  "maxBytes",
  "requestsPerMinute",
  "snapshotsPerDay",
] as const;

export async function listUsers(
  db: ServerKysely,
  now: number,
): Promise<AdminUser[]> {
  const users = await db
    .selectFrom("user")
    .select(["id", "name", "email", "role", "createdAt", "disabled"])
    .orderBy("createdAt")
    .execute();
  const stored = await db
    .selectFrom("head")
    .select([
      "user_id",
      sql<number>`sum(length(CAST(data AS BLOB)))`.as("bytes"),
      sql<number>`max(received_at)`.as("last"),
    ])
    .groupBy("user_id")
    .execute();
  const today = await db
    .selectFrom("usage")
    .select(["user_id", "bytes_written"])
    .where("day", "=", utcDay(now))
    .execute();
  const quotas = await db.selectFrom("quota").selectAll().execute();
  const byUser = <T extends { user_id: string }>(rows: T[]) =>
    new Map(rows.map((row) => [row.user_id, row]));
  const storedBy = byUser(stored);
  const todayBy = byUser(today);
  const quotaBy = byUser(quotas);
  const result: AdminUser[] = [];
  for (const user of users) {
    const quota = quotaBy.get(user.id);
    const limits = await readLimits(db, user.id, now);
    result.push({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role === "owner" ? "owner" : "user",
      createdAt: toMillis(user.createdAt),
      disabled: user.disabled === 1,
      lastSyncAt: storedBy.get(user.id)?.last ?? null,
      bytesWrittenToday: todayBy.get(user.id)?.bytes_written ?? 0,
      storedBytes: storedBy.get(user.id)?.bytes ?? 0,
      overrides: {
        bytesPerDay: quota?.bytes_per_day ?? null,
        maxBytes: quota?.max_bytes ?? null,
        requestsPerMinute: quota?.requests_per_minute ?? null,
        snapshotsPerDay: quota?.snapshots_per_day ?? null,
      },
      exemptUntil: limits?.exemptUntil ?? null,
    });
  }
  return result;
}

/** Null when `body` isn't a full set of overrides. */
function parseOverrides(body: unknown): QuotaOverrides | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const overrides = {} as QuotaOverrides;
  for (const key of OVERRIDE_KEYS) {
    const value = record[key];
    if (value === null) {
      overrides[key] = null;
    } else if (Number.isSafeInteger(value) && (value as number) >= 0) {
      overrides[key] = value as number;
    } else {
      return null;
    }
  }
  return overrides;
}

export function adminRoutes(
  db: ServerKysely,
  limitCache: LimitCache,
  now: () => number = Date.now,
) {
  const app = new Hono<AuthEnv>();
  app.use(requireOwner);

  app.get("/users", async (c) =>
    c.json({
      users: await listUsers(db, now()),
      defaults: DEFAULT_QUOTA,
      maxAccounts: limitCache.maxAccountsSetting,
      defaultMaxAccounts: DEFAULT_MAX_ACCOUNTS,
    } satisfies AdminUsers),
  );

  /** The account cap; null is the default. Below the account count, it only stops sign-ups. */
  app.put("/limits", async (c) => {
    const body = await c.req.json().catch(() => null);
    const value: unknown = body?.maxAccounts;
    if (
      value !== null &&
      !(Number.isSafeInteger(value) && (value as number) >= 1)
    ) {
      return c.json({ error: "invalid" }, 400);
    }
    await db
      .updateTable("limits")
      .set({ max_accounts: value as number | null })
      .where("id", "=", 1)
      .execute();
    await limitCache.refresh();
    return c.body(null, 204);
  });

  // Every action is on another account; the owner's own has no quota and
  // can't be disabled.
  app.use("/users/:id/*", async (c, next) => {
    const id = c.req.param("id");
    if (id === c.get("user").id) {
      return c.json({ error: "not_for_owner" }, 400);
    }
    const user = await db
      .selectFrom("user")
      .select("id")
      .where("id", "=", id)
      .executeTakeFirst();
    if (!user) return c.json({ error: "not found" }, 404);
    await next();
  });

  app.put("/users/:id/quota", async (c) => {
    const overrides = parseOverrides(await c.req.json().catch(() => null));
    if (!overrides) return c.json({ error: "invalid" }, 400);
    const row = {
      bytes_per_day: overrides.bytesPerDay,
      max_bytes: overrides.maxBytes,
      requests_per_minute: overrides.requestsPerMinute,
      snapshots_per_day: overrides.snapshotsPerDay,
    };
    await db
      .insertInto("quota")
      .values({ user_id: c.req.param("id"), ...row })
      .onConflict((oc) => oc.column("user_id").doUpdateSet(row))
      .execute();
    await limitCache.refresh();
    return c.body(null, 204);
  });

  /** Lifts the daily write limit for the next 24 h, e.g. for an import. */
  app.post("/users/:id/exempt", async (c) => {
    const exemptUntil = now() + EXEMPTION_MS;
    await db
      .insertInto("quota")
      .values({ user_id: c.req.param("id"), exempt_until: exemptUntil })
      .onConflict((oc) =>
        oc.column("user_id").doUpdateSet({ exempt_until: exemptUntil }),
      )
      .execute();
    return c.json({ exemptUntil });
  });

  app.post("/users/:id/disable", async (c) => {
    const id = c.req.param("id");
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("user")
        .set({ disabled: 1 })
        .where("id", "=", id)
        .execute();
      await sql`DELETE FROM session WHERE userId = ${id}`.execute(trx);
    });
    return c.body(null, 204);
  });

  app.post("/users/:id/enable", async (c) => {
    await db
      .updateTable("user")
      .set({ disabled: 0 })
      .where("id", "=", c.req.param("id"))
      .execute();
    return c.body(null, 204);
  });

  return app;
}
