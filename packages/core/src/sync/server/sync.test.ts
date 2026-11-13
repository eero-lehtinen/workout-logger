import { describe, expect, it } from "vitest";
import { openTestServer } from "../../testing.ts";
import { formatHlc } from "../hlc.ts";
import type { Change } from "../protocol.ts";
import {
  canonicalJson,
  dataBytes,
  FUTURE_CLOCK_LIMIT_MS,
  MAX_PULL_PAGE_BYTES,
  MAX_ROW_DATA_BYTES,
  newEpoch,
  type PushQuota,
  pull,
  push,
  ROW_OVERHEAD_BYTES,
  readEpoch,
  rowBytes,
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
  quota?: PushQuota,
) {
  return push(
    db,
    user,
    { device_id: "dev", client_version: "1.0.0", changes },
    quota ? { now: NOW, quota } : { now: NOW },
  );
}

/** A quota with a fixed allowance that remembers what was recorded. */
function fixedQuota(written: number, stored = Number.POSITIVE_INFINITY) {
  const recorded: number[] = [];
  const quota: PushQuota = {
    allowance: async () => ({ written, stored }),
    record: async (_, bytes) => {
      recorded.push(bytes);
    },
  };
  return { quota, recorded };
}

/** The bytes a change of `change()` costs. */
const size = (overrides: Partial<Change> = {}) => {
  const { table, id, data } = change(overrides);
  return rowBytes(table, id, canonicalJson(data));
};

async function lastSeq(
  db: Awaited<ReturnType<typeof openTestServer>>["db"],
  user = "u1",
) {
  const row = await db
    .selectFrom("user_sync")
    .select("seq")
    .where("user_id", "=", user)
    .executeTakeFirst();
  return row?.seq ?? 0;
}

describe("push", () => {
  it("keeps the newest version of each row with a new seq", async () => {
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
        device_id: "dev",
        received_at: NOW,
      },
    ]);
    expect(await lastSeq(db)).toBe(2);
  });

  it("acknowledges an older version without storing it or using quota", async () => {
    const { db } = await openTestServer();
    await pushAs(db, "u1", [change({ hlc: hlc(NOW + 5) })]);
    const older = await pushAs(
      db,
      "u1",
      [change({ hlc: hlc(NOW + 1), data: { value_json: '"lb"' } })],
      fixedQuota(0, 0).quota,
    );
    expect(older).toMatchObject({ results: [{ status: "ok" }], inserted: 0 });
    expect(
      await db.selectFrom("head").select(["hlc", "seq"]).execute(),
    ).toEqual([{ hlc: hlc(NOW + 5), seq: 1 }]);
    expect(await lastSeq(db)).toBe(1);
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
    expect(await db.selectFrom("head").selectAll().execute()).toHaveLength(1);
    expect(await lastSeq(db)).toBe(1);
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

  it("acknowledges an older version from an outdated app instead of refusing it", async () => {
    const { db } = await openTestServer();
    await pushAs(db, "u1", [change({ hlc: hlc(NOW + 5), v: 2 })]);
    const { results } = await pushAs(db, "u1", [
      change({ hlc: hlc(NOW), v: 1 }),
    ]);
    expect(results).toEqual([{ status: "ok" }]);
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

  it("stops storing at the daily bytes but still acknowledges duplicates", async () => {
    const { db } = await openTestServer();
    await pushAs(db, "u1", [change({ id: "a" })]);
    const { quota, recorded } = fixedQuota(size({ id: "b" }) + 1);
    const result = await pushAs(
      db,
      "u1",
      [change({ id: "b" }), change({ id: "c" }), change({ id: "a" })],
      quota,
    );
    expect(result).toMatchObject({
      results: [
        { status: "ok" },
        { status: "rejected", reason: "quota" },
        { status: "ok" },
      ],
      inserted: 1,
    });
    expect(recorded).toEqual([size({ id: "b" })]);
  });

  it("refuses the rest of a push once one version doesn't fit", async () => {
    const { db } = await openTestServer();
    const big = { data: { value_json: "x".repeat(100) } };
    const result = await pushAs(
      db,
      "u1",
      [change({ id: "a", ...big }), change({ id: "b" })],
      fixedQuota(size({ id: "b" }) + 50).quota,
    );
    expect(result.results).toEqual([
      { status: "rejected", reason: "quota" },
      { status: "rejected", reason: "quota" },
    ]);
  });

  it("counts a replaced row's new size against storage, not both versions", async () => {
    const { db } = await openTestServer();
    await pushAs(db, "u1", [change({ data: { value_json: "x".repeat(300) } })]);
    // The same size again grows nothing.
    const same = await pushAs(
      db,
      "u1",
      [change({ hlc: hlc(NOW + 1), data: { value_json: "y".repeat(300) } })],
      fixedQuota(Number.POSITIVE_INFINITY, 0).quota,
    );
    expect(same.results).toEqual([{ status: "ok" }]);
    // A shrink makes room for the next row of the same push.
    const shrink = await pushAs(
      db,
      "u1",
      [
        change({ hlc: hlc(NOW + 2), data: { value_json: "" } }),
        // What the shrink freed: 300 bytes, with its JSON, key and overhead.
        change({ id: "other", data: { value_json: "z".repeat(71) } }),
      ],
      fixedQuota(Number.POSITIVE_INFINITY, 0).quota,
    );
    expect(shrink.results).toEqual([{ status: "ok" }, { status: "ok" }]);
    const grow = await pushAs(
      db,
      "u1",
      [
        change({
          id: "other",
          hlc: hlc(NOW + 3),
          data: { value_json: "z".repeat(72) },
        }),
      ],
      fixedQuota(Number.POSITIVE_INFINITY, 0).quota,
    );
    expect(grow.results).toEqual([{ status: "rejected", reason: "quota" }]);
  });

  it("lets a user over a lowered storage limit shrink, not grow", async () => {
    const { db } = await openTestServer();
    await pushAs(db, "u1", [change({ data: { value_json: "x".repeat(50) } })]);
    const over = fixedQuota(Number.POSITIVE_INFINITY, -40).quota;
    const results = await pushAs(
      db,
      "u1",
      [
        change({ hlc: hlc(NOW + 1), data: { value_json: "x".repeat(20) } }),
        change({ id: "new", data: { value_json: "" } }),
      ],
      over,
    );
    expect(results.results).toEqual([
      { status: "ok" },
      { status: "rejected", reason: "quota" },
    ]);
  });

  it("refuses data over MAX_ROW_DATA_BYTES as invalid", async () => {
    const { db } = await openTestServer();
    const sized = (id: string, bytes: number) =>
      // `{"value_json":""}` is 17 bytes.
      change({ id, data: { value_json: "x".repeat(bytes - 17) } });
    const result = await pushAs(db, "u1", [
      sized("fits", MAX_ROW_DATA_BYTES),
      sized("over", MAX_ROW_DATA_BYTES + 1),
    ]);
    expect(result.results).toEqual([
      { status: "ok" },
      { status: "rejected", reason: "invalid" },
    ]);
  });

  it("counts UTF-8 bytes", () => {
    expect(dataBytes('{"n":"ä"}')).toBe(10);
  });

  it("counts a row's key and fixed overhead, not only its data", async () => {
    const { db } = await openTestServer();
    const empty = {
      table: `t${"a".repeat(63)}`,
      id: "i".repeat(128),
      data: {},
    };
    const cost = rowBytes(empty.table, empty.id, "{}");
    expect(cost).toBe(2 + 64 + 128 + ROW_OVERHEAD_BYTES);
    const result = await pushAs(
      db,
      "u1",
      [change(empty), change({ ...empty, id: "j".repeat(128) })],
      fixedQuota(Number.POSITIVE_INFINITY, cost * 2 - 1).quota,
    );
    expect(result.results).toEqual([
      { status: "ok" },
      { status: "rejected", reason: "quota" },
    ]);
  });
});

describe("newEpoch", () => {
  it("replaces the epoch", async () => {
    const { db } = await openTestServer();
    const before = await readEpoch(db);
    const epoch = await newEpoch(db);
    expect(epoch).not.toBe(before);
    expect(await readEpoch(db)).toBe(epoch);
  });
});

describe("pull and snapshot", () => {
  it("sends a row replaced since the cursor once, in its newest version", async () => {
    const { db } = await openTestServer();
    await pushAs(db, "u1", [change({ id: "a" }), change({ id: "b" })]);
    const cursor = (await pull(db, "u1", 0)).cursor;
    await pushAs(db, "u1", [
      change({ id: "a", hlc: hlc(NOW + 1) }),
      change({ id: "a", hlc: hlc(NOW + 2), deleted: true }),
    ]);
    const next = await pull(db, "u1", cursor);
    expect(next.changes.map((c) => [c.seq, c.id, c.hlc, c.deleted])).toEqual([
      [4, "a", hlc(NOW + 2), true],
    ]);
  });

  it("ends a page before its data passes MAX_PULL_PAGE_BYTES", async () => {
    const { db } = await openTestServer();
    const big = (id: string) =>
      change({
        id,
        data: { value_json: "x".repeat(MAX_ROW_DATA_BYTES - 100) },
      });
    const ids = Array.from({ length: 20 }, (_, i) => `r${i}`);
    await pushAs(db, "u1", ids.map(big));

    const first = await pull(db, "u1", 0);
    const firstBytes = first.changes
      .map((c) => dataBytes(canonicalJson(c.data)))
      .reduce((a, b) => a + b, 0);
    expect(first.more).toBe(true);
    expect(first.changes.length).toBeGreaterThan(1);
    expect(firstBytes).toBeLessThanOrEqual(MAX_PULL_PAGE_BYTES);
    const second = await pull(db, "u1", first.cursor);
    expect(second.more).toBe(false);
    expect([...first.changes, ...second.changes].map((c) => c.id)).toEqual(ids);
  });

  it("pages through one user's rows in seq order", async () => {
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
      [2, "b"],
    ]);
    expect(first).toMatchObject({
      cursor: 2,
      more: true,
      epoch: await readEpoch(db),
    });
    const second = await pull(db, "u1", first.cursor, 2);
    expect(second.changes).toEqual([
      {
        seq: 3,
        table: "setting",
        id: "c",
        hlc: hlc(NOW),
        deleted: true,
        v: 1,
        data: { value_json: '"kg"' },
      },
    ]);
    expect(second).toMatchObject({ cursor: 3, more: false });
    expect(await pull(db, "u1", 3)).toMatchObject({
      changes: [],
      cursor: 3,
      more: false,
    });
  });

  it("numbers each user's rows from their own counter", async () => {
    const { db } = await openTestServer();
    const ids = (from: number, n: number) =>
      Array.from({ length: n }, (_, i) => change({ id: `r${from + i}` }));
    await pushAs(db, "u1", ids(0, 3));
    await pushAs(db, "u2", ids(0, 2));
    await pushAs(db, "u1", ids(3, 2));
    await pushAs(db, "u2", [
      ...ids(2, 1),
      change({ id: "r0", hlc: hlc(NOW + 1) }),
    ]);
    // Refused and acknowledged-only changes take no number.
    await pushAs(db, "u1", [change({ id: "r0" }), change({ hlc: "nope" })]);

    const seqs = async (user: string) =>
      (await pull(db, user, 0)).changes.map((c) => [c.seq, c.id]);
    expect(await seqs("u1")).toEqual([
      [1, "r0"],
      [2, "r1"],
      [3, "r2"],
      [4, "r3"],
      [5, "r4"],
    ]);
    expect(await seqs("u2")).toEqual([
      [2, "r1"],
      [3, "r2"],
      [4, "r0"],
    ]);
    expect([await lastSeq(db, "u1"), await lastSeq(db, "u2")]).toEqual([5, 4]);
    expect((await snapshot(db, "u2")).cursor).toBe(4);
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
