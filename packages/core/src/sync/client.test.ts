import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type TableName } from "../schema/tables.ts";
import type { Store } from "../store/store.ts";
import { openTestServer, openTestStore } from "../testing.ts";
import {
  acknowledgePush,
  applyPull,
  applySnapshot,
  collectPush,
  readSyncState,
} from "./client.ts";
import { formatHlc, parseHlc } from "./hlc.ts";
import type { PulledChange, PullResponse } from "./protocol.ts";
import { newEpoch, pull, push, snapshot } from "./server/sync.ts";

const T0 = 1_700_000_000_000;
const remoteHlc = (wall: number, counter = 0) =>
  formatHlc({ wall, counter, node: "bbbbbbbbbbbb" });

async function setup() {
  const server = await openTestServer();
  const device = await openTestStore({ now: () => T0 });
  return { server: server.db, device };
}

async function outbox(store: Store) {
  return store.db.selectFrom("_outbox").select(["table_name", "id"]).execute();
}

function page(
  changes: PulledChange[],
  overrides: Partial<PullResponse> = {},
): PullResponse {
  return {
    epoch: "e1",
    changes,
    cursor: changes.at(-1)?.seq ?? 0,
    more: false,
    ...overrides,
  };
}

function pulled(
  seq: number,
  hlc: string,
  value: string,
  overrides: Partial<PulledChange> = {},
): PulledChange {
  return {
    seq,
    table: "setting",
    id: "unit",
    hlc,
    deleted: false,
    v: SCHEMA_VERSION,
    data: { value_json: value },
    ...overrides,
  };
}

describe("push", () => {
  it("sends queued rows and clears them once acknowledged", async () => {
    const { server, device } = await setup();
    await device.write((w) =>
      w.insert("setting", { id: "unit", value_json: '"kg"' }),
    );
    const sent = (await collectPush(device)).changes;
    expect(sent).toEqual([
      {
        table: "setting",
        id: "unit",
        hlc: `001700000000000-00000-${device.deviceId}`,
        deleted: false,
        v: SCHEMA_VERSION,
        data: { value_json: '"kg"' },
      },
    ]);
    const response = await push(
      server,
      "u1",
      { device_id: device.deviceId, client_version: "1", changes: sent },
      { now: T0 },
    );
    expect(await acknowledgePush(device, sent, response)).toEqual({
      acknowledged: 1,
      rejected: [],
    });
    expect((await readSyncState(device)).epoch).toBe(response.epoch);
    expect(await outbox(device)).toEqual([]);
  });

  it("keeps a row queued when it changed while the push was in flight", async () => {
    const { device } = await setup();
    await device.write((w) =>
      w.insert("setting", { id: "unit", value_json: '"kg"' }),
    );
    const sent = (await collectPush(device)).changes;
    await device.write((w) =>
      w.update("setting", "unit", { value_json: '"lb"' }),
    );
    await acknowledgePush(device, sent, {
      epoch: "e1",
      results: [{ status: "ok" }],
    });
    expect((await collectPush(device)).changes).toMatchObject([
      { data: { value_json: '"lb"' } },
    ]);
  });

  it("keeps rejected rows queued and reports why", async () => {
    const { device } = await setup();
    await device.write((w) =>
      w.insert("setting", { id: "unit", value_json: '"kg"' }),
    );
    const sent = (await collectPush(device)).changes;
    const result = await acknowledgePush(device, sent, {
      epoch: "e1",
      results: [{ status: "rejected", reason: "quota" }],
    });
    expect(result.rejected).toEqual([{ change: sent[0], reason: "quota" }]);
    expect(await outbox(device)).toHaveLength(1);
    await expect(
      acknowledgePush(device, sent, { epoch: "e1", results: [] }),
    ).rejects.toThrow("0 push results for 1");
  });

  it("remembers the epoch from a push made before the first pull, to detect a later restore", async () => {
    const { server, device } = await setup();
    const pushAll = async () => {
      const sent = (await collectPush(device)).changes;
      const response = await push(
        server,
        "u1",
        { device_id: device.deviceId, client_version: "1", changes: sent },
        { now: T0 },
      );
      return acknowledgePush(device, sent, response);
    };
    await device.write((w) =>
      w.insert("setting", { id: "a", value_json: "1" }),
    );
    await pushAll();
    const first = (await readSyncState(device)).epoch;

    // The restore loses "a". A known epoch isn't replaced by a push response.
    const epoch = await newEpoch(server);
    await device.write((w) =>
      w.insert("setting", { id: "b", value_json: "1" }),
    );
    await pushAll();
    expect((await readSyncState(device)).epoch).toBe(first);

    expect(await applyPull(device, await pull(server, "u1", 0))).toEqual({
      status: "epoch_changed",
    });
    expect((await outbox(device)).map((e) => e.id).sort()).toEqual(["a", "b"]);
    expect(await readSyncState(device)).toEqual({ epoch, cursor: 0 });
  });

  it("limits a batch and sends in queue order", async () => {
    const { device } = await setup();
    for (const id of ["c", "a", "b"]) {
      await device.write((w) => w.insert("setting", { id, value_json: "1" }));
    }
    expect((await collectPush(device, 2)).changes.map((c) => c.id)).toEqual([
      "c",
      "a",
    ]);
  });
});

describe("applyPull", () => {
  it("applies newer rows, skips older ones and echoes, and stores the cursor", async () => {
    const { device } = await setup();
    const events: TableName[][] = [];
    device.subscribe((t) => events.push([...t]));

    expect(
      await applyPull(device, page([pulled(1, remoteHlc(T0 + 10), '"kg"')])),
    ).toEqual({ status: "applied", applied: 1 });
    expect(
      await applyPull(device, page([pulled(2, remoteHlc(T0 + 5), '"old"')])),
    ).toEqual({ status: "applied", applied: 0 });
    expect(
      await applyPull(device, page([pulled(3, remoteHlc(T0 + 10), '"kg"')])),
    ).toEqual({ status: "applied", applied: 0 });

    expect(
      await device.db
        .selectFrom("setting")
        .select(["value_json", "hlc"])
        .execute(),
    ).toEqual([{ value_json: '"kg"', hlc: remoteHlc(T0 + 10) }]);
    expect(await readSyncState(device)).toEqual({ epoch: "e1", cursor: 3 });
    expect(events[0]).toContain("setting");
    expect(await outbox(device)).toEqual([]);
  });

  it("drops the outbox entry and undo history of a local edit that lost", async () => {
    const { device } = await setup();
    await device.write((w) =>
      w.insert("setting", { id: "unit", value_json: '"local"' }),
    );
    await applyPull(device, page([pulled(1, remoteHlc(T0 + 10), '"remote"')]));
    expect(await outbox(device)).toEqual([]);
    expect(await device.undo()).toBe(false);
  });

  it("keeps a local edit that is newer", async () => {
    const { device } = await setup();
    await device.write((w) =>
      w.insert("setting", { id: "unit", value_json: '"local"' }),
    );
    await applyPull(device, page([pulled(1, remoteHlc(T0 - 10), '"remote"')]));
    expect(
      await device.db
        .selectFrom("setting")
        .select("value_json")
        .executeTakeFirst(),
    ).toEqual({ value_json: '"local"' });
    expect(await outbox(device)).toHaveLength(1);
  });

  it("moves the local clock past received changes", async () => {
    const { device } = await setup();
    await applyPull(
      device,
      page([pulled(1, remoteHlc(T0 + 60_000, 4), '"kg"')]),
    );
    await device.write((w) =>
      w.insert("setting", { id: "other", value_json: "1" }),
    );
    const hlc = (
      await device.db
        .selectFrom("setting")
        .select("hlc")
        .where("id", "=", "other")
        .executeTakeFirst()
    )?.hlc;
    // Receiving counter 4 sets the clock to 5; the write ticks to 6.
    expect(parseHlc(hlc ?? "")).toMatchObject({
      wall: T0 + 60_000,
      counter: 6,
    });
  });

  it("stops before a change from a newer schema and keeps the cursor before it", async () => {
    const { device } = await setup();
    const outcome = await applyPull(
      device,
      page([
        pulled(4, remoteHlc(T0), '"a"', { id: "a" }),
        pulled(7, remoteHlc(T0), '"b"', { id: "b", v: SCHEMA_VERSION + 1 }),
        pulled(9, remoteHlc(T0), '"c"', { id: "c" }),
      ]),
    );
    expect(outcome).toEqual({ status: "update_required", applied: 1 });
    expect(
      (await device.db.selectFrom("setting").select("id").execute()).map(
        (r) => r.id,
      ),
    ).toEqual(["a"]);
    expect((await readSyncState(device)).cursor).toBe(4);
  });

  it("on a new epoch queues every row for re-upload and restarts from cursor 0", async () => {
    const { device } = await setup();
    await applyPull(
      device,
      page([pulled(1, remoteHlc(T0), '"kg"')], { epoch: "e1" }),
    );
    await device.write((w) =>
      w.insert("metric", {
        name: "Fat",
        unit: "%",
        position: "a0",
        archived: 0,
      }),
    );
    const outcome = await applyPull(
      device,
      page([pulled(1, remoteHlc(T0 + 99), '"lb"')], { epoch: "e2" }),
    );
    expect(outcome).toEqual({ status: "epoch_changed" });
    expect((await outbox(device)).map((e) => e.table_name).sort()).toEqual([
      "metric",
      "setting",
    ]);
    expect(await readSyncState(device)).toEqual({ epoch: "e2", cursor: 0 });
    expect(
      await device.db
        .selectFrom("setting")
        .select("value_json")
        .executeTakeFirst(),
    ).toEqual({ value_json: '"kg"' });
  });
});

describe("applySnapshot", () => {
  it("bootstraps a new device from the server head", async () => {
    const { server, device } = await setup();
    const other = await openTestStore({ now: () => T0 });
    await other.write(async (w) => {
      await w.insert("setting", { id: "unit", value_json: '"kg"' });
      await w.insert("setting", { id: "gone", value_json: "1" });
    });
    await other.write((w) => w.delete("setting", "gone"));
    await push(
      server,
      "u1",
      {
        device_id: other.deviceId,
        client_version: "1",
        changes: (await collectPush(other)).changes,
      },
      { now: T0 },
    );

    expect(await readSyncState(device)).toEqual({ epoch: null, cursor: null });
    expect(await applySnapshot(device, await snapshot(server, "u1"))).toEqual({
      status: "applied",
      applied: 2,
    });
    expect(await readSyncState(device)).toMatchObject({ cursor: 2 });
    expect(
      await device.db
        .selectFrom("setting")
        .select(["id", "deleted"])
        .orderBy("id")
        .execute(),
    ).toEqual([
      { id: "gone", deleted: 1 },
      { id: "unit", deleted: 0 },
    ]);
    expect(await pull(server, "u1", 2)).toMatchObject({ changes: [] });
  });

  it("applies nothing from a snapshot with a newer schema", async () => {
    const { device } = await setup();
    const outcome = await applySnapshot(device, {
      epoch: "e1",
      cursor: 5,
      changes: [{ ...pulled(1, remoteHlc(T0), '"kg"'), v: SCHEMA_VERSION + 1 }],
    });
    expect(outcome).toEqual({ status: "update_required", applied: 0 });
    expect(await readSyncState(device)).toEqual({ epoch: null, cursor: null });
  });

  it("does not bootstrap over rows pushed under an older epoch", async () => {
    const { server, device } = await setup();
    await device.write((w) =>
      w.insert("setting", { id: "a", value_json: "1" }),
    );
    const sent = (await collectPush(device)).changes;
    await acknowledgePush(
      device,
      sent,
      await push(
        server,
        "u1",
        { device_id: device.deviceId, client_version: "1", changes: sent },
        { now: T0 },
      ),
    );
    await newEpoch(server);
    expect(await applySnapshot(device, await snapshot(server, "u1"))).toEqual({
      status: "epoch_changed",
    });
    expect(await outbox(device)).toHaveLength(1);
  });

  it("detects a restored server through pull", async () => {
    const { server, device } = await setup();
    await applySnapshot(device, await snapshot(server, "u1"));
    await newEpoch(server);
    expect(await applyPull(device, await pull(server, "u1", 0))).toEqual({
      status: "epoch_changed",
    });
  });
});
