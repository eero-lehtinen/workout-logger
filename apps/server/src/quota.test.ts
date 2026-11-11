import type { Change, PushResponse } from "@workout-logger/core";
import { formatHlc, SCHEMA_VERSION } from "@workout-logger/core";
import { newEpoch } from "@workout-logger/core/sync-server";
import { describe, expect, it } from "vitest";
import { syncDb } from "./db/database.ts";
import { DEFAULT_QUOTA, pruneUsage, type UsageReport } from "./quota.ts";
import { openTestApp } from "./testing.ts";

const DAY = 24 * 60 * 60 * 1000;
/** Past the 24 h after sign-up in which the daily limit doesn't apply. */
const LATER = Date.now() + 2 * DAY;

// Not ahead of any test's server clock, which would be `future_clock`.
let wall = Date.now() - 60_000;
function change(id: string, bytes: number): Change {
  // `{"value_json":""}` is 17 bytes.
  return {
    table: "setting",
    id,
    hlc: formatHlc({ wall: wall++, counter: 0, node: "aaaaaaaaaaaa" }),
    deleted: false,
    v: SCHEMA_VERSION,
    data: { value_json: "x".repeat(bytes - 17) },
  };
}

async function setup(now = LATER) {
  const clock = { now };
  const test = await openTestApp({ now: () => clock.now });
  const alice = await test.signIn("alice@example.com");
  const call = (
    user: { token: string; userId: string },
    path: string,
    init: RequestInit = {},
  ) =>
    test.app.request(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${user.token}`,
        "x-expected-user": user.userId,
      },
    });
  const pushAs = async (
    user: { token: string; userId: string },
    changes: Change[],
  ) => {
    const res = await call(user, "/api/sync/v1/push", {
      method: "POST",
      body: JSON.stringify({
        device_id: "aaaaaaaaaaaa",
        client_version: "test",
        changes,
      }),
    });
    return ((await res.json()) as PushResponse).results.map((r) =>
      r.status === "ok" ? "ok" : r.reason,
    );
  };
  const usage = async (user = alice) =>
    (await (await call(user, "/api/me/usage")).json()) as UsageReport;
  const setQuota = (
    userId: string,
    quota: {
      bytes_per_day?: number;
      max_bytes?: number;
      snapshots_per_day?: number;
      requests_per_minute?: number;
      exempt_until?: number;
    },
  ) =>
    test.db
      .insertInto("quota")
      .values({ user_id: userId, ...quota })
      .onConflict((oc) => oc.column("user_id").doUpdateSet(quota))
      .execute();
  return { ...test, clock, alice, call, pushAs, usage, setQuota };
}

describe("daily bytes written", () => {
  it("rejects what doesn't fit as quota, and counts only stored versions", async () => {
    const { alice, pushAs, usage, setQuota } = await setup();
    await setQuota(alice.userId, { bytes_per_day: 250 });
    const a = change("a", 100);
    expect(
      await pushAs(alice, [a, change("b", 100), change("c", 100)]),
    ).toEqual(["ok", "ok", "quota"]);
    expect((await usage()).bytesWritten).toBe(200);

    // A retry and an older version are free.
    const older = {
      ...change("a", 100),
      hlc: formatHlc({ wall: 1, counter: 0, node: "aaaaaaaaaaaa" }),
    };
    expect(await pushAs(alice, [a, older])).toEqual(["ok", "ok"]);
    expect((await usage()).bytesWritten).toBe(200);
    expect(await pushAs(alice, [change("d", 51)])).toEqual(["quota"]);
    expect(await pushAs(alice, [change("d", 50)])).toEqual(["ok"]);
  });

  it("starts again the next UTC day", async () => {
    const { alice, clock, pushAs, setQuota } = await setup();
    await setQuota(alice.userId, { bytes_per_day: 100 });
    expect(await pushAs(alice, [change("a", 100)])).toEqual(["ok"]);
    expect(await pushAs(alice, [change("b", 100)])).toEqual(["quota"]);
    clock.now += DAY;
    expect(await pushAs(alice, [change("b", 100)])).toEqual(["ok"]);
  });

  it("doesn't limit the owner", async () => {
    const { signIn, pushAs, usage } = await setup();
    const owner = await signIn("owner@example.com", "owner");
    const big = Array.from({ length: 6 }, (_, i) =>
      // Under the 1 MB push body each, over the default daily limit together.
      change(`o${i}`, 1000 * 1000),
    );
    for (const c of big) expect(await pushAs(owner, [c])).toEqual(["ok"]);
    expect(await usage(owner)).toMatchObject({
      bytesPerDay: null,
      maxBytes: null,
      snapshotsPerDay: null,
    });
  });
});

describe("exemptions", () => {
  async function overDaily(now = LATER) {
    const test = await setup(now);
    await test.setQuota(test.alice.userId, {
      bytes_per_day: 100,
      max_bytes: 300,
    });
    return test;
  }

  it("lifts the daily limit in the first 24 h of an account, not the storage one", async () => {
    const { alice, pushAs, usage } = await overDaily(Date.now());
    expect(
      await pushAs(alice, [
        change("a", 150),
        change("b", 150),
        change("c", 17),
      ]),
    ).toEqual(["ok", "ok", "quota"]);
    expect((await usage()).exemptUntil).toBeGreaterThan(Date.now());
  });

  it("lifts it for 24 h after a new epoch", async () => {
    const test = await overDaily();
    await newEpoch(syncDb(test.db), LATER - DAY + 1000);
    expect(
      await test.pushAs(test.alice, [change("a", 150), change("b", 150)]),
    ).toEqual(["ok", "ok"]);
    test.clock.now += 2000;
    expect(await test.pushAs(test.alice, [change("c", 50)])).toEqual(["quota"]);
  });

  it("lifts it until the owner's exempt_until", async () => {
    const test = await overDaily();
    await test.setQuota(test.alice.userId, { exempt_until: LATER + 1000 });
    expect(
      await test.pushAs(test.alice, [change("a", 150), change("b", 150)]),
    ).toEqual(["ok", "ok"]);
    expect(await test.pushAs(test.alice, [change("c", 17)])).toEqual(["quota"]);
    test.clock.now += 1000;
    expect((await test.usage()).exemptUntil).toBeNull();
  });
});

describe("stored bytes", () => {
  it("counts a replaced row's new size, not both versions", async () => {
    const { alice, pushAs, usage, setQuota } = await setup();
    await setQuota(alice.userId, { max_bytes: 200 });
    expect(await pushAs(alice, [change("a", 100), change("b", 100)])).toEqual([
      "ok",
      "ok",
    ]);
    expect(await pushAs(alice, [change("a", 100)])).toEqual(["ok"]);
    expect(await pushAs(alice, [change("a", 101)])).toEqual(["quota"]);
    expect(await usage()).toMatchObject({
      storedBytes: 200,
      maxBytes: 200,
      bytesWritten: 300,
    });
  });
});

describe("snapshots", () => {
  it("answers 429 quota past the daily count", async () => {
    const { alice, call, setQuota, usage } = await setup();
    await setQuota(alice.userId, { snapshots_per_day: 2 });
    for (let i = 0; i < 2; i++) {
      expect((await call(alice, "/api/sync/v1/snapshot")).status).toBe(200);
    }
    const over = await call(alice, "/api/sync/v1/snapshot");
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({ error: "quota" });
    expect((await usage()).snapshots).toBe(2);
  });

  it("allows the default number", async () => {
    const { alice, call } = await setup();
    for (let i = 0; i < DEFAULT_QUOTA.snapshotsPerDay; i++) {
      expect((await call(alice, "/api/sync/v1/snapshot")).status).toBe(200);
    }
    expect((await call(alice, "/api/sync/v1/snapshot")).status).toBe(429);
  });
});

describe("usage", () => {
  it("reports today's usage with the default limits", async () => {
    const { alice, pushAs, usage } = await setup();
    await pushAs(alice, [change("a", 100)]);
    expect(await usage()).toEqual({
      day: new Date(LATER).toISOString().slice(0, 10),
      bytesWritten: 100,
      bytesPerDay: DEFAULT_QUOTA.bytesPerDay,
      exemptUntil: null,
      storedBytes: 100,
      maxBytes: DEFAULT_QUOTA.maxBytes,
      snapshots: 0,
      snapshotsPerDay: DEFAULT_QUOTA.snapshotsPerDay,
    });
  });

  it("prunes rows older than 90 days", async () => {
    const { db, alice } = await setup();
    await db
      .insertInto("usage")
      .values([
        {
          user_id: alice.userId,
          day: "2026-01-01",
          bytes_written: 1,
          snapshots: 0,
        },
        {
          user_id: alice.userId,
          day: "2026-04-01",
          bytes_written: 1,
          snapshots: 0,
        },
      ])
      .execute();
    await pruneUsage(db, Date.parse("2026-06-30T12:00:00Z"));
    expect(
      (await db.selectFrom("usage").select("day").execute()).map((r) => r.day),
    ).toEqual(["2026-04-01"]);
  });

  it("applies a request limit override from the in-memory copy", async () => {
    const { alice, call, setQuota, limitCache } = await setup();
    await setQuota(alice.userId, { requests_per_minute: 3 });
    // Read from memory: unchanged until refreshed.
    for (let i = 0; i < 4; i++) {
      expect((await call(alice, "/api/me")).status).toBe(200);
    }
    await limitCache.refresh();
    expect((await call(alice, "/api/me")).status).toBe(429);
  });

  it("starts with the limits row empty", async () => {
    const { db, limitCache, alice } = await setup();
    expect(await db.selectFrom("limits").selectAll().execute()).toEqual([
      { id: 1, max_accounts: null },
    ]);
    expect(limitCache.requestsPerMinute(alice.userId)).toBe(
      DEFAULT_QUOTA.requestsPerMinute,
    );
  });

  it("refuses a second limits row", async () => {
    const { db } = await setup();
    await expect(
      db.insertInto("limits").values({ id: 2, max_accounts: 5 }).execute(),
    ).rejects.toThrow();
  });

  it("applies a request limit override to a fresh window", async () => {
    const { alice, call, setQuota, limitCache } = await setup();
    await setQuota(alice.userId, { requests_per_minute: 3 });
    await limitCache.refresh();
    for (let i = 0; i < 3; i++) {
      expect((await call(alice, "/api/me")).status).toBe(200);
    }
    expect((await call(alice, "/api/me")).status).toBe(429);
  });
});
