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
  serverSyncMigration,
} from "./schema.ts";
import { pull, push } from "./sync.ts";

const hlc = (wall: number) => formatHlc({ wall, counter: 0, node: "dev" });

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
    const counter = await db
      .selectFrom("server_meta")
      .select("value")
      .where("key", "=", "seq")
      .executeTakeFirstOrThrow();
    expect(counter.value).toBe("5");
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
