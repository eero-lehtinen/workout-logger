import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openNodeDriver } from "../db/node-driver.ts";
import type { TableName } from "../schema/tables.ts";
import { deterministicHlc, parseHlc } from "../sync/hlc.ts";
import { openTestStore } from "../testing.ts";
import { writeDeterministic } from "./deterministic.ts";
import { openStore, type Store } from "./store.ts";
import { UNDO_DEPTH } from "./write.ts";

const T0 = 1_700_000_000_000;

async function setup(now = () => T0) {
  const store = await openTestStore({ now });
  const events: TableName[][] = [];
  store.subscribe((tables) => events.push([...tables].sort()));
  return { store, events };
}

const metric = {
  name: "Body fat",
  unit: "%",
  position: "a0",
  archived: 0,
} as const;

async function row(store: Store, table: "metric" | "setting", id: string) {
  return store.db
    .selectFrom(table)
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}

async function outbox(store: Store) {
  return store.db
    .selectFrom("_outbox")
    .select(["table_name", "id"])
    .orderBy("table_name")
    .orderBy("id")
    .execute();
}

describe("write", () => {
  it("stamps, queues, and reports each write", async () => {
    const { store, events } = await setup();
    const id = await store.write((w) => w.insert("metric", metric));
    expect(await row(store, "metric", id)).toEqual({
      id,
      hlc: `001700000000000-00000-${store.deviceId}`,
      deleted: 0,
      ...metric,
      builtin_key: null,
    });
    expect(await outbox(store)).toEqual([{ table_name: "metric", id }]);
    expect(events).toEqual([["_outbox", "_undo", "metric"]]);
  });

  it("generates UUIDv7 ids and refuses to insert over an existing row", async () => {
    const { store } = await setup();
    const id = await store.write((w) => w.insert("metric", metric));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    await expect(
      store.write((w) => w.insert("metric", { ...metric, id })),
    ).rejects.toThrow("already exists");
  });

  it("updates, puts, and soft-deletes with increasing HLCs", async () => {
    const { store } = await setup();
    const id = await store.write((w) => w.insert("metric", metric));
    const hlcs = [(await row(store, "metric", id))?.hlc];
    await store.write((w) => w.update("metric", id, { name: "Fat" }));
    hlcs.push((await row(store, "metric", id))?.hlc);
    await store.write((w) => w.delete("metric", id));
    hlcs.push((await row(store, "metric", id))?.hlc);
    await store.write((w) => w.put("metric", id, { ...metric, name: "Back" }));
    hlcs.push((await row(store, "metric", id))?.hlc);

    expect(hlcs.map((h) => parseHlc(h ?? "").counter)).toEqual([0, 1, 2, 3]);
    expect(await row(store, "metric", id)).toMatchObject({
      name: "Back",
      deleted: 0,
    });
    expect(await outbox(store)).toEqual([{ table_name: "metric", id }]);
  });

  it("deleting a deleted row writes nothing; updating a missing row throws", async () => {
    const { store } = await setup();
    const id = await store.write((w) => w.insert("metric", metric));
    await store.write((w) => w.delete("metric", id));
    const hlc = (await row(store, "metric", id))?.hlc;
    await store.write((w) => w.delete("metric", id));
    expect((await row(store, "metric", id))?.hlc).toBe(hlc);
    await expect(
      store.write((w) => w.update("metric", "missing", { name: "x" })),
    ).rejects.toThrow("not found");
  });

  it("beats a row version from a clock far ahead (the write guard)", async () => {
    const { store } = await setup();
    const future = deterministicHlc(T0 + 3_600_000, "fitnotes");
    await writeDeterministic(store, [
      {
        table: "metric",
        id: "m",
        hlc: future,
        data: { ...metric, builtin_key: null },
      },
    ]);
    await store.write((w) => w.update("metric", "m", { name: "Mine" }));
    const hlc = (await row(store, "metric", "m"))?.hlc ?? "";
    expect(hlc > future).toBe(true);
    expect(parseHlc(hlc)).toEqual({
      wall: T0 + 3_600_000,
      counter: 1,
      node: store.deviceId,
    });
  });

  it("persists the clock so it never goes backwards", async () => {
    let now = T0 + 1000;
    const { store } = await setup(() => now);
    await store.write((w) => w.insert("setting", { id: "a", value_json: "1" }));
    now = T0;
    await store.write((w) => w.insert("setting", { id: "b", value_json: "1" }));
    expect(
      parseHlc((await row(store, "setting", "b"))?.hlc ?? ""),
    ).toMatchObject({ wall: T0 + 1000, counter: 1 });
    const state = await store.db
      .selectFrom("_sync_state")
      .select("value")
      .where("key", "=", "last_hlc")
      .executeTakeFirst();
    expect(state?.value).toBe(`001700000001000-00001-${store.deviceId}`);
  });

  it("rolls back everything, and emits nothing, when the callback throws", async () => {
    const { store, events } = await setup();
    await expect(
      store.write(async (w) => {
        await w.insert("metric", metric);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await store.db.selectFrom("metric").selectAll().execute()).toEqual(
      [],
    );
    expect(await outbox(store)).toEqual([]);
    expect(events).toEqual([]);
    expect(
      await store.db
        .selectFrom("_sync_state")
        .selectAll()
        .where("key", "=", "last_hlc")
        .execute(),
    ).toEqual([]);
  });

  it("keeps the device id and clock across reopening the database", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wl-store-"));
    const file = join(dir, "db.sqlite3");
    try {
      const first = await openStore(openNodeDriver(file), { now: () => T0 });
      await first.write((w) =>
        w.insert("setting", { id: "a", value_json: "1" }),
      );
      await first.close();
      const second = await openStore(openNodeDriver(file), { now: () => T0 });
      expect(second.deviceId).toBe(first.deviceId);
      expect(second.deviceId).toMatch(/^[0-9a-f]{12}$/);
      await second.write((w) =>
        w.insert("setting", { id: "b", value_json: "1" }),
      );
      expect(
        parseHlc((await row(second, "setting", "b"))?.hlc ?? "").counter,
      ).toBe(1);
      await second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("undo", () => {
  it("reverts the latest transaction as new changes", async () => {
    const { store } = await setup();
    const id = await store.write((w) => w.insert("metric", metric));
    await store.write(async (w) => {
      await w.update("metric", id, { name: "One" });
      await w.update("metric", id, { name: "Two" });
      await w.insert("setting", { id: "unit", value_json: '"kg"' });
    });
    const before = (await row(store, "metric", id))?.hlc ?? "";

    expect(await store.undo()).toBe(true);
    const reverted = await row(store, "metric", id);
    expect(reverted).toMatchObject({ name: "Body fat", deleted: 0 });
    expect((reverted?.hlc ?? "") > before).toBe(true);
    expect(await row(store, "setting", "unit")).toMatchObject({ deleted: 1 });

    expect(await store.undo()).toBe(true);
    expect(await row(store, "metric", id)).toMatchObject({ deleted: 1 });
    expect(await store.undo()).toBe(false);
  });

  it("undoes a given transaction only while it is the latest", async () => {
    const { store } = await setup();
    const first = await store.writeUndoable((w) => w.insert("metric", metric));
    const second = await store.writeUndoable((w) =>
      w.update("metric", first.result, { name: "Two" }),
    );
    expect(second.undoTx).toBe((first.undoTx ?? 0) + 1);

    expect(await store.undo(first.undoTx ?? 0)).toBe(false);
    expect(await row(store, "metric", first.result)).toMatchObject({
      name: "Two",
    });
    expect(await store.undo(second.undoTx ?? 0)).toBe(true);
    expect(await row(store, "metric", first.result)).toMatchObject({
      name: "Body fat",
    });
  });

  it("revives a deleted row", async () => {
    const { store } = await setup();
    const id = await store.write((w) => w.insert("metric", metric), {
      undoable: false,
    });
    await store.write((w) => w.delete("metric", id));
    await store.undo();
    expect(await row(store, "metric", id)).toMatchObject({
      deleted: 0,
      name: "Body fat",
    });
  });

  it("skips writes made with undoable: false and keeps a bounded history", async () => {
    const { store } = await setup();
    await store.write(
      (w) => w.insert("setting", { id: "a", value_json: "0" }),
      { undoable: false },
    );
    expect(await store.undo()).toBe(false);
    for (let i = 1; i <= UNDO_DEPTH + 5; i++) {
      await store.write((w) =>
        w.put("setting", "a", { value_json: String(i) }),
      );
    }
    const txs = await store.db
      .selectFrom("_undo")
      .select("tx")
      .distinct()
      .execute();
    expect(txs).toHaveLength(UNDO_DEPTH);
  });
});

describe("writeDeterministic", () => {
  const seedHlc = (version: number) =>
    deterministicHlc(T0 - 86_400_000 + version, "seed");
  const muscle = (name: string) => ({ name, group_name: "Back" });

  it("writes identical rows on every device", async () => {
    const a = (await setup()).store;
    const b = (await setup()).store;
    const rows = [
      {
        table: "muscle" as const,
        id: "m",
        hlc: seedHlc(1),
        data: muscle("Lats"),
      },
    ];
    await writeDeterministic(a, rows);
    await writeDeterministic(b, rows);
    const dump = (s: Store) => s.db.selectFrom("muscle").selectAll().execute();
    expect(await dump(a)).toEqual(await dump(b));
    expect(await outbox(a)).toEqual([{ table_name: "muscle", id: "m" }]);
  });

  it("is idempotent, applies newer versions, and never overwrites user edits", async () => {
    const { store, events } = await setup();
    const v1 = [
      {
        table: "muscle" as const,
        id: "m",
        hlc: seedHlc(1),
        data: muscle("Lats"),
      },
    ];
    expect(await writeDeterministic(store, v1)).toEqual({
      written: 1,
      skipped: 0,
    });
    expect(await writeDeterministic(store, v1)).toEqual({
      written: 0,
      skipped: 1,
    });
    expect(events).toHaveLength(1);

    const v2 = [
      {
        table: "muscle" as const,
        id: "m",
        hlc: seedHlc(2),
        data: muscle("Latissimus"),
      },
    ];
    expect(await writeDeterministic(store, v2)).toEqual({
      written: 1,
      skipped: 0,
    });

    await store.write((w) => w.update("muscle", "m", { name: "My lats" }));
    const v3 = [
      {
        table: "muscle" as const,
        id: "m",
        hlc: seedHlc(3),
        data: muscle("Lats v3"),
      },
    ];
    expect(await writeDeterministic(store, v3)).toEqual({
      written: 0,
      skipped: 1,
    });
    expect(
      (await store.db.selectFrom("muscle").select("name").executeTakeFirst())
        ?.name,
    ).toBe("My lats");
  });

  it("rejects malformed HLCs", async () => {
    const { store } = await setup();
    await expect(
      writeDeterministic(store, [
        { table: "muscle", id: "m", hlc: "seed", data: muscle("Lats") },
      ]),
    ).rejects.toThrow("invalid HLC");
  });
});
