import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SYNCED_TABLES } from "../schema/tables.ts";
import { writeDeterministic } from "../store/deterministic.ts";
import { readHlc } from "../store/rows.ts";
import type { Store } from "../store/store.ts";
import { openTestServer, openTestStore } from "../testing.ts";
import {
  acknowledgePush,
  applyPull,
  applySnapshot,
  collectPush,
  readSyncState,
} from "./client.ts";
import { deterministicHlc } from "./hlc.ts";
import type { Change } from "./protocol.ts";
import {
  canonicalJson,
  newEpoch,
  pull,
  push,
  snapshot,
} from "./server/sync.ts";

// Model-based test of the clock and merge logic (docs/sync.md#testing). Raise
// SYNC_FUZZ_RUNS for a longer local run.
const RUNS = Number(process.env.SYNC_FUZZ_RUNS ?? 300);

const T0 = 1_700_000_000_000;
const MINUTE = 60_000;
const DEVICES = 3;
const USER = "u1";
const ROW_IDS = ["r0", "r1", "r2", "r3"] as const;
const TABLES = ["setting", "metric", "muscle"] as const;
type FuzzTable = (typeof TABLES)[number];

type Fate = "ok" | "lostRequest" | "lostResponse" | "duplicate";
type Op =
  | { k: "put"; d: number; table: FuzzTable; row: string; value: number }
  | { k: "update"; d: number; table: FuzzTable; row: string; value: number }
  | { k: "delete"; d: number; table: FuzzTable; row: string }
  | { k: "undo"; d: number }
  | { k: "seed"; d: number; version: number }
  | { k: "push"; d: number; limit: number }
  | { k: "deliver"; d: number; fate: Fate }
  | { k: "pull"; d: number; limit: number; lost: boolean }
  | { k: "time"; ms: number }
  | { k: "skew"; d: number; offset: number }
  | { k: "checkpoint" }
  | { k: "restore" };

const device = fc.integer({ min: 0, max: DEVICES - 1 });
const table = fc.constantFrom(...TABLES);
const row = fc.constantFrom(...ROW_IDS);
const value = fc.integer({ min: 0, max: 99 });
const k = <K extends Op["k"]>(name: K) => fc.constant(name);

const opArbitrary: fc.Arbitrary<Op> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({ k: k("put"), d: device, table, row, value }),
  },
  {
    weight: 4,
    arbitrary: fc.record({ k: k("update"), d: device, table, row, value }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ k: k("delete"), d: device, table, row }),
  },
  { weight: 1, arbitrary: fc.record({ k: k("undo"), d: device }) },
  {
    weight: 1,
    arbitrary: fc.record({
      k: k("seed"),
      d: device,
      version: fc.integer({ min: 1, max: 4 }),
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      k: k("push"),
      d: device,
      limit: fc.integer({ min: 1, max: 6 }),
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      k: k("deliver"),
      d: device,
      fate: fc.constantFrom<Fate>(
        "ok",
        "ok",
        "lostRequest",
        "lostResponse",
        "duplicate",
      ),
    }),
  },
  {
    weight: 5,
    arbitrary: fc.record({
      k: k("pull"),
      d: device,
      limit: fc.integer({ min: 1, max: 4 }),
      lost: fc.boolean(),
    }),
  },
  {
    weight: 3,
    // Often no time passes, so devices write at the same wall and HLC
    // counters decide.
    arbitrary: fc.record({
      k: k("time"),
      ms: fc.oneof(
        fc.constant(0),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 0, max: 10 * MINUTE }),
      ),
    }),
  },
  {
    weight: 1,
    // Within the server's one-hour future-clock bound.
    arbitrary: fc.record({
      k: k("skew"),
      d: device,
      offset: fc.integer({ min: -50 * MINUTE, max: 50 * MINUTE }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ k: k("checkpoint") }) },
  { weight: 1, arbitrary: fc.record({ k: k("restore") }) },
);

function rowData(table: FuzzTable, value: number) {
  switch (table) {
    case "setting":
      return { value_json: String(value) };
    case "metric":
      return {
        name: `m${value}`,
        unit: "kg",
        position: "a0",
        archived: 0 as const,
      };
    case "muscle":
      return { name: `x${value}`, group_name: "g" };
  }
}

/**
 * Deterministic rows can carry HLCs ahead of the writing device's clock (an
 * import stamped by a device whose clock was ahead), which is what makes the
 * write guard necessary.
 */
function seedRows(version: number) {
  const hlc = deterministicHlc(T0 + (version - 2) * 15 * MINUTE, "seed");
  return ROW_IDS.map((id) => ({
    table: "muscle" as const,
    id,
    hlc,
    data: { name: `seed v${version}`, group_name: "g" },
  }));
}

interface Device {
  store: Store;
  offset: number;
  inflight: Change[] | null;
}

class World {
  time = T0;
  devices: Device[] = [];
  server!: Awaited<ReturnType<typeof openTestServer>>;
  checkpoint!: Uint8Array;

  async init() {
    this.server = await openTestServer();
    this.checkpoint = this.server.serialize();
    for (let i = 0; i < DEVICES; i++) {
      const d: Device = {
        offset: 0,
        inflight: null,
        store: undefined as unknown as Store,
      };
      d.store = await openTestStore({ now: () => this.time + d.offset });
      this.devices.push(d);
    }
  }

  device(i: number): Device {
    const d = this.devices[i];
    if (!d) throw new Error(`no device ${i}`);
    return d;
  }

  /**
   * The newest version of each row that ever existed on any device. LWW
   * means the newest version must win everywhere, so after quiescing the
   * server's head must equal this: a lost write fails here even when every
   * device agrees on the loss.
   */
  newest = new Map<string, DumpRow & { table: string }>();

  async run(op: Op) {
    await this.apply(op);
    if ("d" in op) {
      const d = this.device(op.d);
      await this.checkClock(d);
      await this.record(d);
    }
  }

  async record(d: Device) {
    for (const [table, rows] of Object.entries(await dumpDevice(d.store))) {
      for (const row of rows) {
        const key = `${table}/${row.id}`;
        const known = this.newest.get(key);
        if (!known || row.hlc > known.hlc)
          this.newest.set(key, { table, ...row });
      }
    }
  }

  newestDump(): Dump {
    const dump: Dump = {};
    const rows = [...this.newest.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    for (const { table, ...row } of rows) {
      dump[table] ??= [];
      dump[table].push(row);
    }
    return dump;
  }

  /**
   * The clock dominates every HLC this device wrote or received, so its next
   * write beats all of them. Deterministic rows keep their source HLCs, which
   * the write guard handles instead.
   */
  async checkClock(d: Device) {
    const state = await d.store.db
      .selectFrom("_sync_state")
      .select("value")
      .where("key", "=", "last_hlc")
      .executeTakeFirst();
    for (const table of TABLES) {
      const max = await d.store.db
        .selectFrom(table)
        .select((eb) => eb.fn.max("hlc").as("hlc"))
        .where("hlc", "not like", "%-seed")
        .executeTakeFirst();
      if (max?.hlc && !(state && state.value >= max.hlc)) {
        throw new Error(
          `clock ${state?.value} is behind ${table} row ${max.hlc}`,
        );
      }
    }
  }

  async apply(op: Op) {
    switch (op.k) {
      case "put":
      case "update":
      case "delete":
        return this.edit(op);
      case "undo":
        return this.device(op.d).store.undo();
      case "seed":
        return writeDeterministic(
          this.device(op.d).store,
          seedRows(op.version),
        );
      case "push": {
        const d = this.device(op.d);
        if (d.inflight) return;
        const batch = (await collectPush(d.store, op.limit)).changes;
        d.inflight = batch.length > 0 ? batch : null;
        return;
      }
      case "deliver":
        return this.deliver(this.device(op.d), op.fate);
      case "pull":
        return this.pull(this.device(op.d), op.limit, op.lost);
      case "time":
        this.time += op.ms;
        return;
      case "skew":
        this.device(op.d).offset = op.offset;
        return;
      case "checkpoint":
        this.checkpoint = this.server.serialize();
        return;
      case "restore": {
        await this.server.close();
        this.server = await openTestServer(this.checkpoint);
        await newEpoch(this.server.db);
        return;
      }
    }
  }

  async edit(op: Extract<Op, { k: "put" | "update" | "delete" }>) {
    const { store } = this.device(op.d);
    const before = await store.db
      .transaction()
      .execute((trx) => readHlc(trx, op.table, op.row));
    if (op.k !== "put" && before === undefined) return;
    await store.write(async (w) => {
      if (op.k === "put")
        return w.put(op.table, op.row, rowData(op.table, op.value));
      if (op.k === "update")
        return w.update(op.table, op.row, rowData(op.table, op.value));
      return w.delete(op.table, op.row);
    });
    const after = await store.db
      .transaction()
      .execute((trx) => readHlc(trx, op.table, op.row));
    // A local edit always beats the version it was made on.
    if (
      before !== undefined &&
      after !== before &&
      !(after !== undefined && after > before)
    ) {
      throw new Error(
        `edit of ${op.table}/${op.row} stamped ${after}, not after ${before}`,
      );
    }
  }

  async deliver(d: Device, fate: Fate) {
    const sent = d.inflight;
    d.inflight = null;
    if (!sent || fate === "lostRequest") return;
    const send = () =>
      push(
        this.server.db,
        USER,
        { device_id: d.store.deviceId, client_version: "test", changes: sent },
        { now: this.time },
      );
    let response = await send();
    if (fate === "duplicate") response = await send();
    const rejected = response.results.filter((r) => r.status !== "ok");
    if (rejected.length > 0)
      throw new Error(`push rejected: ${JSON.stringify(rejected)}`);
    if (fate !== "lostResponse") await acknowledgePush(d.store, sent, response);
  }

  /** One request. Returns whether the caller should keep pulling. */
  async pull(d: Device, limit: number, lost: boolean): Promise<boolean> {
    const { cursor } = await readSyncState(d.store);
    if (cursor === null) {
      const snap = await snapshot(this.server.db, USER);
      if (!lost) await applySnapshot(d.store, snap);
      return !lost;
    }
    const page = await pull(this.server.db, USER, cursor, limit);
    if (lost) return false;
    const outcome = await applyPull(d.store, page);
    if (outcome.status === "update_required")
      throw new Error("unexpected update_required");
    return outcome.status === "applied" && page.more;
  }

  /** Syncs every device without failures until nothing moves. */
  async quiesce() {
    for (const d of this.devices) await this.deliver(d, "ok");
    for (let round = 0; round < 10; round++) {
      const before = await this.fingerprint();
      for (const d of this.devices) {
        for (
          let batch = (await collectPush(d.store, 50)).changes;
          batch.length > 0;
          batch = (await collectPush(d.store, 50)).changes
        ) {
          d.inflight = batch;
          await this.deliver(d, "ok");
        }
      }
      for (const d of this.devices) {
        while (await this.pull(d, 1000, false)) {}
      }
      if ((await this.fingerprint()) === before) return;
    }
    throw new Error("did not quiesce in 10 rounds");
  }

  async fingerprint() {
    const parts = [
      String(
        (
          await this.server.db
            .selectFrom("change")
            .select((eb) => eb.fn.countAll().as("n"))
            .executeTakeFirst()
        )?.n,
      ),
    ];
    for (const d of this.devices)
      parts.push(
        JSON.stringify(await dumpDevice(d.store)),
        JSON.stringify(await readSyncState(d.store)),
      );
    return parts.join("|");
  }

  async close() {
    for (const d of this.devices) await d.store.close();
    await this.server.close();
  }
}

type DumpRow = { id: string; hlc: string; deleted: number; data: string };
type Dump = Record<string, DumpRow[]>;

async function dumpDevice(store: Store): Promise<Dump> {
  const dump: Dump = {};
  for (const table of SYNCED_TABLES) {
    const rows = await store.db
      .selectFrom(table)
      .selectAll()
      .orderBy("id")
      .execute();
    if (rows.length === 0) continue;
    dump[table] = rows.map(({ id, hlc, deleted, ...data }) => ({
      id,
      hlc,
      deleted,
      data: canonicalJson(data),
    }));
  }
  return dump;
}

async function dumpServerHead(world: World): Promise<Dump> {
  const rows = await world.server.db
    .selectFrom("head")
    .selectAll()
    .where("user_id", "=", USER)
    .orderBy("table_name")
    .orderBy("id")
    .execute();
  const dump: Dump = {};
  for (const { table_name, id, hlc, deleted, data } of rows) {
    dump[table_name] ??= [];
    dump[table_name].push({ id, hlc, deleted, data });
  }
  return dump;
}

describe("sync", () => {
  it(
    "converges on every device and the server under random edits, faults, and restores",
    async () => {
      await fc.assert(
        // size "max": the default size caps generated arrays at about 10 ops.
        fc.asyncProperty(
          fc.array(opArbitrary, { maxLength: 150, size: "max" }),
          async (ops) => {
            const world = new World();
            await world.init();
            try {
              for (const op of ops) await world.run(op);
              await world.quiesce();

              const head = await dumpServerHead(world);
              expect(head).toEqual(world.newestDump());
              for (const d of world.devices) {
                expect(await dumpDevice(d.store)).toEqual(head);
                expect(
                  await d.store.db.selectFrom("_outbox").selectAll().execute(),
                ).toEqual([]);
              }
            } finally {
              await world.close();
            }
          },
        ),
        { numRuns: RUNS },
      );
    },
    30 * MINUTE,
  );
});
