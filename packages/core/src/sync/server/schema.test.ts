import Database from "better-sqlite3";
import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { createKysely } from "../../db/driver.ts";
import { nodeDriver } from "../../db/node-driver.ts";
import type { UntypedKysely } from "../../migrations/types.ts";
import { formatHlc } from "../hlc.ts";
import {
  type ServerSyncTables,
  serverHeadOnlyMigration,
  serverPerUserSeqMigration,
  serverSyncMigration,
} from "./schema.ts";
import { pull, push, snapshot } from "./sync.ts";

const hlc = (wall: number) => formatHlc({ wall, counter: 0, node: "dev" });

async function globalSeq(db: UntypedKysely) {
  const { rows } = await sql<{
    value: string;
  }>`SELECT value FROM server_meta WHERE key = 'seq'`.execute(db);
  return rows[0]?.value;
}

describe("serverHeadOnlyMigration", () => {
  it("keeps the newest version of each row and continues the seq", async () => {
    const sqlite = new Database(":memory:");
    const db = createKysely<ServerSyncTables>(nodeDriver(sqlite));
    const untyped = db as unknown as UntypedKysely;
    await serverSyncMigration.up(untyped);
    // Two versions of one row, a tombstone, another user's row, and a late
    // older version that only the log took, written the way the change-log
    // push did. The log's last seq (5) is above the head's (4).
    const log = [
      ["u1", "a", hlc(1), 0, '{"x":1}', "d1", 10],
      ["u1", "a", hlc(2), 0, '{"x":2}', "d2", 20],
      ["u1", "b", hlc(1), 1, '{"x":3}', "d1", 30],
      ["u2", "a", hlc(1), 0, '{"x":4}', "d3", 40],
      ["u1", "a", hlc(0), 0, '{"x":0}', "d3", 50],
    ] as const;
    for (const [
      seq,
      [user, id, h, deleted, data, device, at],
    ] of log.entries()) {
      await sql`INSERT INTO change (user_id, table_name, id, hlc, deleted, v, data, device_id, received_at)
        VALUES (${user}, 'setting', ${id}, ${h}, ${deleted}, 1, ${data}, ${device}, ${at})`.execute(
        untyped,
      );
      await sql`INSERT INTO head VALUES (${user}, 'setting', ${id}, ${h}, ${deleted}, 1, ${data}, ${seq + 1})
        ON CONFLICT DO UPDATE SET hlc = excluded.hlc, data = excluded.data, seq = excluded.seq
        WHERE excluded.hlc > head.hlc`.execute(untyped);
    }

    await serverHeadOnlyMigration.up(untyped);

    const tables = sqlite
      .prepare("select name from sqlite_master where type = 'table'")
      .pluck()
      .all();
    expect(tables).not.toContain("change");
    expect(
      await db
        .selectFrom("head")
        .selectAll()
        .orderBy("user_id")
        .orderBy("id")
        .execute(),
    ).toEqual([
      {
        user_id: "u1",
        table_name: "setting",
        id: "a",
        hlc: hlc(2),
        deleted: 0,
        v: 1,
        data: '{"x":2}',
        seq: 2,
        device_id: "d2",
        received_at: 20,
      },
      {
        user_id: "u1",
        table_name: "setting",
        id: "b",
        hlc: hlc(1),
        deleted: 1,
        v: 1,
        data: '{"x":3}',
        seq: 3,
        device_id: "d1",
        received_at: 30,
      },
      {
        user_id: "u2",
        table_name: "setting",
        id: "a",
        hlc: hlc(1),
        deleted: 0,
        v: 1,
        data: '{"x":4}',
        seq: 4,
        device_id: "d3",
        received_at: 40,
      },
    ]);

    // A device that had pulled up to seq 2 sees only what came after; one
    // that had pulled the late version at 5 sees nothing until a new push.
    expect((await pull(db, "u1", 2)).changes.map((c) => c.id)).toEqual(["b"]);
    expect((await pull(db, "u1", 5)).changes).toEqual([]);
    expect(await globalSeq(untyped)).toBe("5");

    // The cursor at 5 is above u1's highest head seq (3), so the per-user
    // counter has to continue from the global one, not from the head.
    await serverPerUserSeqMigration.up(untyped);
    await push(
      db,
      "u1",
      {
        device_id: "d1",
        client_version: "test",
        changes: [
          {
            table: "setting",
            id: "c",
            hlc: hlc(5),
            deleted: false,
            v: 1,
            data: { x: 5 },
          },
        ],
      },
      { now: 50 },
    );
    expect((await pull(db, "u1", 5)).changes.map((c) => [c.seq, c.id])).toEqual(
      [[6, "c"]],
    );
  });
});

describe("serverPerUserSeqMigration", () => {
  async function headOnlyServer() {
    const sqlite = new Database(":memory:");
    const db = createKysely<ServerSyncTables>(nodeDriver(sqlite));
    const untyped = db as unknown as UntypedKysely;
    await serverSyncMigration.up(untyped);
    await serverHeadOnlyMigration.up(untyped);
    return { db, untyped };
  }

  const pushAs = (
    db: Awaited<ReturnType<typeof headOnlyServer>>["db"],
    user: string,
    rows: [id: string, wall: number][],
  ) =>
    push(
      db,
      user,
      {
        device_id: "d1",
        client_version: "test",
        changes: rows.map(([id, wall]) => ({
          table: "setting",
          id,
          hlc: hlc(wall),
          deleted: false,
          v: 1,
          data: { wall },
        })),
      },
      { now: 100 },
    );

  /** Every page from `after` until `more` is false, as `[seq, id]`. */
  async function pullAll(
    db: Awaited<ReturnType<typeof headOnlyServer>>["db"],
    user: string,
    after: number,
  ) {
    const pulled: [number, string][] = [];
    for (let cursor = after, more = true; more; ) {
      const page = await pull(db, user, cursor, 1);
      pulled.push(...page.changes.map((c): [number, string] => [c.seq, c.id]));
      ({ cursor, more } = page);
    }
    return pulled;
  }

  it("continues each user's seq above every cursor the global counter handed out", async () => {
    const { db, untyped } = await headOnlyServer();
    // Global seqs interleaved across users. 7 went to a version of u1's that
    // only the change log kept, so a u1 device can hold cursor 7. u3 has head
    // rows but, unlike anything push wrote, no user_sync row.
    const head = [
      ["u1", "a", 1],
      ["u2", "x", 2],
      ["u1", "b", 3],
      ["u2", "y", 4],
      ["u2", "z", 5],
      ["u1", "c", 6],
      ["u3", "q", 8],
    ] as const;
    for (const [user, id, seq] of head) {
      await sql`INSERT INTO head VALUES (${user}, 'setting', ${id}, ${hlc(seq)}, 0, 1, ${`{"wall":${seq}}`}, ${seq}, 'd0', 0)`.execute(
        untyped,
      );
    }
    await sql`INSERT INTO user_sync (user_id, max_v) VALUES ('u1', 1), ('u2', 1), ('u4', 1)`.execute(
      untyped,
    );
    await sql`UPDATE server_meta SET value = '8' WHERE key = 'seq'`.execute(
      untyped,
    );

    await serverPerUserSeqMigration.up(untyped);

    expect(
      await db.selectFrom("user_sync").selectAll().orderBy("user_id").execute(),
    ).toEqual([
      { user_id: "u1", max_v: 1, seq: 8 },
      { user_id: "u2", max_v: 1, seq: 8 },
      { user_id: "u3", max_v: 0, seq: 8 },
      { user_id: "u4", max_v: 1, seq: 8 },
    ]);
    expect(await globalSeq(untyped)).toBeUndefined();
    expect(await db.selectFrom("server_meta").select("key").execute()).toEqual([
      { key: "epoch" },
    ]);

    // New rows and a replaced one, interleaved across users.
    await pushAs(db, "u1", [["d", 10]]);
    await pushAs(db, "u2", [["w", 10]]);
    await pushAs(db, "u1", [["a", 11]]);
    await pushAs(db, "u5", [["n", 10]]);

    // From every cursor a device can hold, a pull returns each row newer
    // than it once, in its newest version, and nothing older.
    const expected: Record<string, Record<number, [number, string][]>> = {
      u1: {
        0: [
          [3, "b"],
          [6, "c"],
          [9, "d"],
          [10, "a"],
        ],
        1: [
          [3, "b"],
          [6, "c"],
          [9, "d"],
          [10, "a"],
        ],
        3: [
          [6, "c"],
          [9, "d"],
          [10, "a"],
        ],
        6: [
          [9, "d"],
          [10, "a"],
        ],
        7: [
          [9, "d"],
          [10, "a"],
        ],
        10: [],
      },
      u2: {
        0: [
          [2, "x"],
          [4, "y"],
          [5, "z"],
          [9, "w"],
        ],
        5: [[9, "w"]],
        9: [],
      },
      u3: { 0: [[8, "q"]], 8: [] },
      u5: { 0: [[1, "n"]] },
    };
    for (const [user, cursors] of Object.entries(expected)) {
      for (const [cursor, rows] of Object.entries(cursors)) {
        expect(await pullAll(db, user, Number(cursor))).toEqual(rows);
      }
    }
    expect((await snapshot(db, "u1")).cursor).toBe(10);
  });
});
