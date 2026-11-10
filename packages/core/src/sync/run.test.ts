import { describe, expect, it } from "vitest";
import type { Store } from "../store/store.ts";
import { openTestServer, openTestStore } from "../testing.ts";
import { adoptAccount, matchAccount, repairClock } from "./account.ts";
import { readSyncState } from "./client.ts";
import { parseHlc } from "./hlc.ts";
import { type SyncTransport, syncOnce } from "./run.ts";
import {
  newEpoch,
  pull,
  push,
  type ServerDb,
  snapshot,
} from "./server/sync.ts";

const T0 = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function transport(
  server: ServerDb,
  userId: string,
  now = () => T0,
): SyncTransport {
  return {
    push: (request) => push(server, userId, request, { now: now() }),
    pull: (after, limit) => pull(server, userId, after, limit),
    snapshot: () => snapshot(server, userId),
  };
}

const options = { clientVersion: "test", pushBatch: 2, pullLimit: 2 };

async function setUnit(store: Store, value: string) {
  await store.write((w) =>
    w.put("setting", "weight_unit", { value_json: JSON.stringify(value) }),
  );
}

async function unit(store: Store) {
  const row = await store.db
    .selectFrom("setting")
    .select(["value_json", "deleted"])
    .where("id", "=", "weight_unit")
    .executeTakeFirst();
  return row && !row.deleted ? JSON.parse(row.value_json) : undefined;
}

async function outboxSize(store: Store) {
  return (await store.db.selectFrom("_outbox").selectAll().execute()).length;
}

async function addSettings(store: Store, count: number) {
  for (let i = 0; i < count; i++) {
    await store.write((w) =>
      w.put("setting", `s${i}`, { value_json: String(i) }),
    );
  }
}

describe("syncOnce", () => {
  it("brings two devices to the same state in batches", async () => {
    const { db: server } = await openTestServer();
    const a = await openTestStore({ now: () => T0 });
    const b = await openTestStore({ now: () => T0 + 1 });
    await addSettings(a, 5);
    await setUnit(b, "lb");

    const first = await syncOnce(a, transport(server, "u1"), options);
    expect(first).toMatchObject({ status: "ok", pushed: 5, rejected: {} });
    await syncOnce(b, transport(server, "u1"), options);
    await syncOnce(a, transport(server, "u1"), options);

    expect(await unit(a)).toBe("lb");
    expect(await b.db.selectFrom("setting").selectAll().execute()).toHaveLength(
      6,
    );
    expect(await outboxSize(a)).toBe(0);
    expect(await outboxSize(b)).toBe(0);
    const status = await b.db
      .selectFrom("_sync_state")
      .select("value")
      .where("key", "=", "last_sync_at")
      .executeTakeFirst();
    expect(status?.value).toBe(String(T0 + 1));
  });

  it("keeps users apart", async () => {
    const { db: server } = await openTestServer();
    const a = await openTestStore({ now: () => T0 });
    const b = await openTestStore({ now: () => T0 });
    await setUnit(a, "lb");
    await syncOnce(a, transport(server, "u1"), options);
    await syncOnce(b, transport(server, "u2"), options);
    expect(await unit(b)).toBeUndefined();
  });

  it("re-uploads everything after a server restore", async () => {
    const backup = await openTestServer();
    const device = await openTestStore({ now: () => T0 });
    await syncOnce(device, transport(backup.db, "u1"), options);
    const restored = await openTestServer(backup.serialize());
    await setUnit(device, "lb");
    await syncOnce(device, transport(backup.db, "u1"), options);

    // The restored server lost the push above and has a new epoch.
    await newEpoch(restored.db);
    const report = await syncOnce(
      device,
      transport(restored.db, "u1"),
      options,
    );
    expect(report.status).toBe("ok");
    expect(await outboxSize(device)).toBe(0);
    const other = await openTestStore({ now: () => T0 });
    await syncOnce(other, transport(restored.db, "u1"), options);
    expect(await unit(other)).toBe("lb");
  });

  it("skips past rejected changes and reports them", async () => {
    const { db: server } = await openTestServer();
    const ahead = T0 + 2 * HOUR;
    const device = await openTestStore({ now: () => ahead });
    await addSettings(device, 3);

    const report = await syncOnce(device, transport(server, "u1"), options);
    expect(report.rejected).toEqual({ future_clock: 3 });
    expect(await outboxSize(device)).toBe(3);
  });
});

describe("repairClock", () => {
  it("re-stamps queued rows from a clock that ran ahead", async () => {
    const { db: server } = await openTestServer();
    let now = T0 + 2 * HOUR;
    const device = await openTestStore({ now: () => now });
    await addSettings(device, 2);
    now = T0;

    expect(await repairClock(device)).toBe(2);
    const rows = await device.db.selectFrom("setting").select("hlc").execute();
    for (const { hlc } of rows) {
      expect(parseHlc(hlc).wall).toBeGreaterThan(T0 + HOUR - 10 * 60_000);
      expect(parseHlc(hlc).wall).toBeLessThan(T0 + HOUR);
    }

    const report = await syncOnce(device, transport(server, "u1"), options);
    expect(report).toMatchObject({ pushed: 2, rejected: {} });
  });

  it("keeps a repaired edit ahead of the version it replaced", async () => {
    const { db: server } = await openTestServer();
    // Ahead, but within the server's limit.
    const other = await openTestStore({ now: () => T0 + HOUR / 2 });
    let now = T0 + 2 * HOUR;
    const device = await openTestStore({ now: () => now });
    await setUnit(other, "kg");
    await syncOnce(other, transport(server, "u1"), options);
    await syncOnce(device, transport(server, "u1"), options);
    await setUnit(device, "lb");
    now = T0;
    expect(
      (await syncOnce(device, transport(server, "u1"), options)).rejected,
    ).toEqual({ future_clock: 1 });

    await repairClock(device);
    await syncOnce(device, transport(server, "u1"), options);
    await syncOnce(other, transport(server, "u1"), options);
    expect(await unit(other)).toBe("lb");
  });

  it("leaves a clock that isn't too far ahead alone", async () => {
    const device = await openTestStore({ now: () => T0 });
    await addSettings(device, 1);
    expect(await repairClock(device)).toBe(0);
  });
});
describe("accounts", () => {
  it("uploads a never-synced device's data to the first account", async () => {
    const device = await openTestStore({ now: () => T0 });
    expect(await matchAccount(device, "u1")).toBe("first");
    await adoptAccount(device, "u1", "keep");
    expect(await matchAccount(device, "u1")).toBe("same");
    expect(await matchAccount(device, "u2")).toBe("other");
  });

  it("merges another account's data into the new one", async () => {
    const { db: server } = await openTestServer();
    const device = await openTestStore({ now: () => T0 });
    await adoptAccount(device, "u1", "keep");
    await setUnit(device, "lb");
    await syncOnce(device, transport(server, "u1"), options);

    const other = await openTestStore({ now: () => T0 + 1 });
    await addSettings(other, 1);
    await syncOnce(other, transport(server, "u2"), options);

    await adoptAccount(device, "u2", "merge");
    expect(await readSyncState(device)).toEqual({ epoch: null, cursor: null });
    await syncOnce(device, transport(server, "u2"), options);
    await syncOnce(other, transport(server, "u2"), options);
    expect(await unit(other)).toBe("lb");
    expect(
      await device.db.selectFrom("setting").select("id").execute(),
    ).toHaveLength(2);
  });

  it("discards local data and takes the new account's", async () => {
    const { db: server } = await openTestServer();
    const device = await openTestStore({ now: () => T0 });
    await adoptAccount(device, "u1", "keep");
    await setUnit(device, "lb");

    await adoptAccount(device, "u2", "discard");
    expect(await unit(device)).toBeUndefined();
    expect(await outboxSize(device)).toBe(0);
    await syncOnce(device, transport(server, "u2"), options);
    const u2 = await openTestStore({ now: () => T0 });
    await syncOnce(u2, transport(server, "u2"), options);
    expect(await unit(u2)).toBeUndefined();
  });
});
