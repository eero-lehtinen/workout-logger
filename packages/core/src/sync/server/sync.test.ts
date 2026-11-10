import { describe, expect, it } from "vitest";
import { openTestServer } from "../../testing.ts";
import { formatHlc } from "../hlc.ts";
import type { Change } from "../protocol.ts";
import {
  FUTURE_CLOCK_LIMIT_MS,
  newEpoch,
  pull,
  push,
  readEpoch,
  snapshot,
} from "./sync.ts";

const NOW = 1_700_000_000_000;
const hlc = (wall: number, counter = 0, node = "aaaaaaaaaaaa") =>
  formatHlc({ wall, counter, node });

function change(overrides: Partial<Change> = {}): Change {
  return {
    table: "setting",
    id: "weight_unit",
    hlc: hlc(NOW),
    deleted: false,
    v: 1,
    data: { value_json: '"kg"' },
    ...overrides,
  };
}

async function pushAs(
  db: Awaited<ReturnType<typeof openTestServer>>["db"],
  user: string,
  changes: Change[],
  quotaRemaining?: number,
) {
  return push(
    db,
    user,
    { device_id: "dev", client_version: "1.0.0", changes },
    quotaRemaining === undefined ? { now: NOW } : { now: NOW, quotaRemaining },
  );
}

describe("push", () => {
  it("appends to the log and updates the head", async () => {
    const { db } = await openTestServer();
    const result = await pushAs(db, "u1", [
      change(),
      change({ hlc: hlc(NOW + 1), data: { value_json: '"lb"' } }),
    ]);
    expect(result).toEqual({
      epoch: await readEpoch(db),
      results: [{ status: "ok" }, { status: "ok" }],
      inserted: 2,
    });
    const log = await db
      .selectFrom("change")
      .selectAll()
      .orderBy("seq")
      .execute();
    expect(log.map((c) => [c.seq, c.hlc, c.device_id, c.received_at])).toEqual([
      [1, hlc(NOW), "dev", NOW],
      [2, hlc(NOW + 1), "dev", NOW],
    ]);
    const head = await db.selectFrom("head").selectAll().execute();
    expect(head).toEqual([
      {
        user_id: "u1",
        table_name: "setting",
        id: "weight_unit",
        hlc: hlc(NOW + 1),
        deleted: 0,
        v: 1,
        data: '{"value_json":"\\"lb\\""}',
        seq: 2,
      },
    ]);
  });

  it("keeps the greatest HLC in the head regardless of arrival order", async () => {
    const { db } = await openTestServer();
    await pushAs(db, "u1", [change({ hlc: hlc(NOW + 5), deleted: true })]);
    await pushAs(db, "u1", [change({ hlc: hlc(NOW + 1) })]);
    const head = await db
      .selectFrom("head")
      .select(["hlc", "deleted", "seq"])
      .executeTakeFirst();
    expect(head).toEqual({ hlc: hlc(NOW + 5), deleted: 1, seq: 1 });
  });

  it("accepts duplicates for free and flags a same-HLC conflict", async () => {
    const { db } = await openTestServer();
    await pushAs(db, "u1", [change({ data: { b: 1, a: 2 } })]);
    const again = await pushAs(db, "u1", [
      change({ data: { a: 2, b: 1 } }),
      change({ data: { a: 3, b: 1 } }),
    ]);
    expect(again).toMatchObject({
      results: [{ status: "ok" }, { status: "rejected", reason: "conflict" }],
      inserted: 0,
    });
    expect(await db.selectFrom("change").selectAll().execute()).toHaveLength(1);
  });

  it("treats a re-sent row upgraded by a migration as a duplicate", async () => {
    const { db } = await openTestServer();
    await pushAs(db, "u1", [change({ v: 1, data: { value_json: '"kg"' } })]);
    const resent = await pushAs(db, "u1", [
      change({ v: 2, data: { value_json: '"kg"', extra: null } }),
      change({ v: 2, deleted: true }),
    ]);
    expect(resent).toMatchObject({
      results: [{ status: "ok" }, { status: "rejected", reason: "conflict" }],
      inserted: 0,
    });
    await pushAs(db, "u1", [change({ id: "other", v: 2 })]);
    const old = await pushAs(db, "u1", [
      change({ v: 1 }),
      change({ id: "new", v: 1 }),
    ]);
    expect(old.results).toEqual([
      { status: "ok" },
      { status: "rejected", reason: "schema_outdated" },
    ]);
  });

  it("rejects malformed changes individually", async () => {
    const { db } = await openTestServer();
    const bad: Change[] = [
      change({ hlc: "nope" }),
      change({ table: "Robert'); drop table change;--" }),
      change({ id: "" }),
      change({ v: 0 }),
      change({ v: 1.5 }),
      change({ data: { nested: { x: 1 } } }),
      change({ data: [] as unknown as Record<string, unknown> }),
      change({ data: { n: Number.NaN } }),
      change({ deleted: 0 as unknown as boolean }),
    ];
    const { results } = await pushAs(db, "u1", [...bad, change()]);
    expect(results.slice(0, -1)).toEqual(
      bad.map(() => ({ status: "rejected", reason: "invalid" })),
    );
    expect(results.at(-1)).toEqual({ status: "ok" });
  });

  it("rejects only the changes from a clock more than an hour ahead", async () => {
    const { db } = await openTestServer();
    const { results } = await pushAs(db, "u1", [
      change({ id: "a", hlc: hlc(NOW + FUTURE_CLOCK_LIMIT_MS) }),
      change({ id: "b", hlc: hlc(NOW + FUTURE_CLOCK_LIMIT_MS + 1) }),
    ]);
    expect(results).toEqual([
      { status: "ok" },
      { status: "rejected", reason: "future_clock" },
    ]);
  });

  it("rejects older schema versions once a newer one was accepted", async () => {
    const { db } = await openTestServer();
    await pushAs(db, "u1", [change({ id: "a", v: 2 })]);
    const { results } = await pushAs(db, "u1", [
      change({ id: "b", v: 1 }),
      change({ id: "c", v: 2 }),
    ]);
    expect(results).toEqual([
      { status: "rejected", reason: "schema_outdated" },
      { status: "ok" },
    ]);
    const other = await pushAs(db, "u2", [change({ v: 1 })]);
    expect(other.results).toEqual([{ status: "ok" }]);
  });

  it("stops inserting at the quota but still acknowledges duplicates", async () => {
    const { db } = await openTestServer();
    await pushAs(db, "u1", [change({ id: "a" })]);
    const result = await pushAs(
      db,
      "u1",
      [change({ id: "b" }), change({ id: "c" }), change({ id: "a" })],
      1,
    );
    expect(result).toMatchObject({
      results: [
        { status: "ok" },
        { status: "rejected", reason: "quota" },
        { status: "ok" },
      ],
      inserted: 1,
    });
  });
});

describe("pull and snapshot", () => {
  it("pages through one user's log in seq order", async () => {
    const { db } = await openTestServer();
    await pushAs(db, "u1", [change({ id: "a" })]);
    await pushAs(db, "u2", [change({ id: "x" })]);
    await pushAs(db, "u1", [
      change({ id: "b" }),
      change({ id: "c", deleted: true }),
    ]);

    const first = await pull(db, "u1", 0, 2);
    expect(first.changes.map((c) => [c.seq, c.id])).toEqual([
      [1, "a"],
      [3, "b"],
    ]);
    expect(first).toMatchObject({
      cursor: 3,
      more: true,
      epoch: await readEpoch(db),
    });
    const second = await pull(db, "u1", first.cursor, 2);
    expect(second.changes).toEqual([
      {
        seq: 4,
        table: "setting",
        id: "c",
        hlc: hlc(NOW),
        deleted: true,
        v: 1,
        data: { value_json: '"kg"' },
      },
    ]);
    expect(second).toMatchObject({ cursor: 4, more: false });
    expect(await pull(db, "u1", 4)).toMatchObject({
      changes: [],
      cursor: 4,
      more: false,
    });
  });

  it("never shows one user's rows to another, even with the same ids", async () => {
    const { db } = await openTestServer();
    await pushAs(db, "u1", [change({ data: { value_json: '"kg"' } })]);
    await pushAs(db, "u2", [change({ data: { value_json: '"lb"' } })]);
    expect((await pull(db, "u1", 0)).changes.map((c) => c.data)).toEqual([
      { value_json: '"kg"' },
    ]);
    expect((await snapshot(db, "u2")).changes.map((c) => c.data)).toEqual([
      { value_json: '"lb"' },
    ]);
    expect(await snapshot(db, "u3")).toMatchObject({ changes: [], cursor: 0 });
  });

  it("clamps the page size", async () => {
    const { db } = await openTestServer();
    await pushAs(db, "u1", [change({ id: "a" }), change({ id: "b" })]);
    expect((await pull(db, "u1", 0, 0)).changes).toHaveLength(1);
    expect((await pull(db, "u1", 0, 10_000)).changes).toHaveLength(2);
  });

  it("snapshots head rows with tombstones and the user's max seq", async () => {
    const { db } = await openTestServer();
    await pushAs(db, "u1", [
      change({ id: "a" }),
      change({ id: "a", hlc: hlc(NOW + 1), deleted: true }),
    ]);
    await pushAs(db, "u2", [change({ id: "x" })]);
    const snap = await snapshot(db, "u1");
    expect(snap.changes).toEqual([
      {
        table: "setting",
        id: "a",
        hlc: hlc(NOW + 1),
        deleted: true,
        v: 1,
        data: { value_json: '"kg"' },
      },
    ]);
    expect(snap.cursor).toBe(2);
  });

  it("changes the epoch on restore", async () => {
    const { db } = await openTestServer();
    const before = await readEpoch(db);
    const after = await newEpoch(db);
    expect(after).not.toBe(before);
    expect((await pull(db, "u1", 0)).epoch).toBe(after);
  });
});
