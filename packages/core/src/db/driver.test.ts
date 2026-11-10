import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { openStore } from "../store/store.ts";
import { createKysely, type Driver } from "./driver.ts";
import { openNodeDriver } from "./node-driver.ts";
import { wasmDriver } from "./wasm-driver.ts";

interface TestDb {
  item: {
    id: number;
    label: string | null;
    weight: number | null;
    blob: Uint8Array | null;
  };
}

const sqlite3 = await sqlite3InitModule();

const drivers: [string, () => Driver][] = [
  ["better-sqlite3", () => openNodeDriver()],
  ["sqlite-wasm", () => wasmDriver(sqlite3, new sqlite3.oo1.DB(":memory:"))],
];

describe.each(drivers)("%s driver", (_name, open) => {
  async function setup() {
    const db = createKysely<TestDb>(open());
    await db.schema
      .createTable("item")
      .addColumn("id", "integer", (c) => c.primaryKey())
      .addColumn("label", "text")
      .addColumn("weight", "real")
      .addColumn("blob", "blob")
      .execute();
    return db;
  }

  it("round-trips values of every storage class", async () => {
    const db = await setup();
    const blob = new Uint8Array([1, 2, 255]);
    const result = await db
      .insertInto("item")
      .values({ id: 1, label: "bench", weight: 102.0582, blob })
      .executeTakeFirst();
    expect(result.numInsertedOrUpdatedRows).toBe(1n);
    expect(result.insertId).toBe(1n);
    await db
      .insertInto("item")
      .values({ id: 2, label: null, weight: null, blob: null })
      .execute();

    const rows = await db
      .selectFrom("item")
      .selectAll()
      .orderBy("id")
      .execute();
    expect(rows[0]).toMatchObject({ id: 1, label: "bench", weight: 102.0582 });
    expect(new Uint8Array(rows[0]?.blob ?? [])).toEqual(blob);
    expect(rows[1]).toEqual({ id: 2, label: null, weight: null, blob: null });
    await db.destroy();
  });

  it("reports affected rows and supports returning", async () => {
    const db = await setup();
    await db
      .insertInto("item")
      .values([{ id: 1 }, { id: 2 }, { id: 3 }])
      .execute();
    const updated = await db
      .updateTable("item")
      .set({ label: "x" })
      .where("id", ">", 1)
      .executeTakeFirst();
    expect(updated.numUpdatedRows).toBe(2n);
    const returned = await db
      .deleteFrom("item")
      .where("id", "=", 3)
      .returning("id")
      .execute();
    expect(returned).toEqual([{ id: 3 }]);
    await db.destroy();
  });

  it("runs statements without parameters and pragmas", async () => {
    const db = await setup();
    await sql`pragma user_version = 7`.execute(db);
    const { rows } = await sql<{
      user_version: number;
    }>`pragma user_version`.execute(db);
    expect(rows).toEqual([{ user_version: 7 }]);
    await db.destroy();
  });

  it("rolls back a failed transaction", async () => {
    const db = await setup();
    await expect(
      db.transaction().execute(async (trx) => {
        await trx.insertInto("item").values({ id: 1 }).execute();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await db.selectFrom("item").selectAll().execute()).toEqual([]);
    await db.destroy();
  });

  it("serializes concurrent transactions on the single connection", async () => {
    const db = await setup();
    await Promise.all(
      [1, 2, 3].map((id) =>
        db.transaction().execute(async (trx) => {
          await trx.insertInto("item").values({ id }).execute();
          await new Promise((resolve) => setTimeout(resolve, 5));
          await trx
            .updateTable("item")
            .set({ label: `t${id}` })
            .where("id", "=", id)
            .execute();
        }),
      ),
    );
    const rows = await db
      .selectFrom("item")
      .select(["id", "label"])
      .orderBy("id")
      .execute();
    expect(rows).toEqual([
      { id: 1, label: "t1" },
      { id: 2, label: "t2" },
      { id: 3, label: "t3" },
    ]);
    await db.destroy();
  });

  it("opens and migrates a store", async () => {
    const store = await openStore(open());
    const id = await store.write((w) =>
      w.insert("setting", { id: "weight_unit", value_json: '"kg"' }),
    );
    expect(id).toBe("weight_unit");
    await store.close();
  });

  it("streams select results", async () => {
    const db = await setup();
    await db
      .insertInto("item")
      .values([{ id: 1 }, { id: 2 }])
      .execute();
    const ids: number[] = [];
    for await (const row of db
      .selectFrom("item")
      .select("id")
      .orderBy("id")
      .stream()) {
      ids.push(row.id);
    }
    expect(ids).toEqual([1, 2]);
    await db.destroy();
  });
});
