import { sql } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { createKysely } from "../db/driver.ts";
import { openNodeDriver } from "../db/node-driver.ts";
import {
  SCHEMA_VERSION,
  SYNCED_COLUMNS,
  SYNCED_TABLES,
} from "../schema/tables.ts";
import { migrateFixture, openDatabaseAt } from "../testing.ts";
import { MIGRATIONS } from "./index.ts";
import { migrate, readSchemaVersion, SchemaTooNewError } from "./runner.ts";
import type { Migration, UntypedKysely } from "./types.ts";
import { upgradeRow } from "./upgrade.ts";

const HLC = "001700000000000-00000-aaaaaaaaaaaa";

const NEXT = SCHEMA_VERSION + 1;

/**
 * A synthetic step after the current version that exercises every kind of
 * row upgrade: a new column derived from data, a table rename, and a split
 * into several rows.
 */
const next: Migration = {
  version: NEXT,
  async up(db) {
    await db.schema
      .alterTable("exercise")
      .addColumn("equipment", "text", (c) => c.notNull().defaultTo(""))
      .execute();
    await db.schema
      .createTable("preference")
      .addColumn("id", "text", (c) => c.primaryKey().notNull())
      .addColumn("hlc", "text", (c) => c.notNull())
      .addColumn("deleted", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("json", "text", (c) => c.notNull())
      .execute();
  },
  upgrade: {
    exercise: ({ id, data }) => [
      {
        table: "exercise",
        id,
        data: {
          ...data,
          equipment: String(data.name).split(" ")[0]?.toLowerCase() ?? "",
        },
      },
    ],
    setting: ({ id, data }) => [
      { table: "preference", id, data: { json: data.value_json } },
    ],
    muscle: ({ id, data }) =>
      String(data.name).includes("/")
        ? String(data.name)
            .split("/")
            .map((name, i) => ({
              table: "muscle",
              id: i === 0 ? id : `${id}:${i}`,
              data: { ...data, name },
            }))
        : [{ table: "muscle", id, data }],
  },
  async cleanup(db) {
    await db.schema.dropTable("setting").execute();
  },
};

const withNext = [...MIGRATIONS, next];

const v1Rows = [
  {
    table: "exercise",
    id: "e1",
    hlc: HLC,
    data: {
      name: "Barbell Row",
      type: "weight_reps",
      default_rest_s: null,
      weight_increment_kg: null,
      notes: "",
      archived: 0,
      builtin_key: null,
    },
  },
  {
    table: "setting",
    id: "weight_unit",
    hlc: HLC,
    deleted: 1 as const,
    data: { value_json: '"kg"' },
  },
  {
    table: "muscle",
    id: "m1",
    hlc: HLC,
    data: { name: "Upper back/Traps", group_name: "Back" },
  },
  {
    table: "muscle",
    id: "m2",
    hlc: HLC,
    data: { name: "Lats", group_name: "Back" },
  },
];

async function columnsOf(db: UntypedKysely, table: string) {
  const { rows } = await sql<{
    name: string;
  }>`select name from pragma_table_info(${table})`.execute(db);
  return rows.map((r) => r.name);
}

describe("migrate", () => {
  it("creates the current schema from scratch", async () => {
    const db = await openDatabaseAt(SCHEMA_VERSION);
    expect(await readSchemaVersion(db)).toBe(SCHEMA_VERSION);
    for (const table of SYNCED_TABLES) {
      expect(await columnsOf(db, table), table).toEqual([
        "id",
        "hlc",
        "deleted",
        ...SYNCED_COLUMNS[table],
      ]);
    }
    for (const table of ["_outbox", "_sync_state", "_undo"]) {
      expect((await columnsOf(db, table)).length, table).toBeGreaterThan(0);
    }
  });

  it("does nothing when already current", async () => {
    const db = await openDatabaseAt(SCHEMA_VERSION);
    expect(await migrate(db)).toEqual({
      from: SCHEMA_VERSION,
      to: SCHEMA_VERSION,
    });
  });

  it("refuses a database from a newer app without touching it", async () => {
    const db = await openDatabaseAt(NEXT, withNext);
    await expect(migrate(db)).rejects.toThrow(SchemaTooNewError);
    expect(await readSchemaVersion(db)).toBe(NEXT);
  });

  it("calls the pre-migration hook only for an existing database", async () => {
    const beforeMigrate = vi.fn(async () => {});
    const db = createKysely<Record<string, Record<string, unknown>>>(
      openNodeDriver(),
    );
    await migrate(db, { beforeMigrate });
    expect(beforeMigrate).not.toHaveBeenCalled();
    await migrate(db, { migrations: withNext, beforeMigrate });
    expect(beforeMigrate).toHaveBeenCalledExactlyOnceWith(SCHEMA_VERSION, NEXT);
  });

  it("rolls back every step when one fails", async () => {
    const failing: Migration = {
      ...next,
      upgrade: {
        muscle: () => {
          throw new Error("bad upgrade");
        },
      },
    };
    const db = await openDatabaseAt(1);
    await db
      .insertInto("muscle")
      .values({ id: "m", hlc: HLC, name: "Lats", group_name: "Back" })
      .execute();
    await expect(
      migrate(db, { migrations: [...MIGRATIONS, failing] }),
    ).rejects.toThrow("bad upgrade");
    expect(await readSchemaVersion(db)).toBe(1);
    expect(await columnsOf(db, "exercise")).not.toContain("equipment");
    expect(await columnsOf(db, "preference")).toEqual([]);
  });

  it("rejects a migration list with gaps", async () => {
    const db = await openDatabaseAt(0);
    await expect(
      migrate(db, {
        migrations: [MIGRATIONS[0] as Migration, { ...next, version: 3 }],
      }),
    ).rejects.toThrow("version 3");
  });
});

describe("row upgrades", () => {
  it("migrated rows equal upgraded rows inserted at the new version", async () => {
    const { migrated, expected } = await migrateFixture({
      fromVersion: 1,
      rows: v1Rows,
      migrations: withNext,
    });
    expect(migrated).toEqual(expected);
    expect(migrated.setting).toBeUndefined();
    expect(migrated.preference).toEqual([
      { id: "weight_unit", hlc: HLC, deleted: 1, json: '"kg"' },
    ]);
    expect(migrated.muscle?.map((m) => [m.id, m.name])).toEqual([
      ["m1", "Upper back"],
      ["m1:1", "Traps"],
      ["m2", "Lats"],
    ]);
    expect(migrated.exercise?.[0]).toMatchObject({
      id: "e1",
      equipment: "barbell",
      hlc: HLC,
    });
  });

  it("chains steps for incoming rows and leaves current rows alone", () => {
    const row = {
      table: "setting",
      id: "weight_unit",
      data: { value_json: '"lb"' },
    };
    expect(upgradeRow(row, 1, withNext)).toEqual([
      { table: "preference", id: "weight_unit", data: { json: '"lb"' } },
    ]);
    expect(upgradeRow(row, NEXT, withNext)).toEqual([row]);
    expect(upgradeRow(row, 1)).toEqual([row]);
  });

  it("keeps queued rows queued under their new table and id, and queues nothing else", async () => {
    const db = await openDatabaseAt(1);
    for (const row of v1Rows) {
      await db
        .insertInto(row.table)
        .values({
          ...row.data,
          id: row.id,
          hlc: row.hlc,
          deleted: row.deleted ?? 0,
        })
        .execute();
    }
    await db
      .insertInto("_outbox")
      .values([
        { table_name: "setting", id: "weight_unit" },
        { table_name: "muscle", id: "m1" },
      ])
      .execute();
    await db
      .insertInto("_undo")
      .values({ tx: 1, table_name: "muscle", id: "m2", previous: null })
      .execute();

    await migrate(db, { migrations: withNext });

    const outbox = await db
      .selectFrom("_outbox")
      .select(["table_name", "id"])
      .orderBy("table_name")
      .orderBy("id")
      .execute();
    expect(outbox).toEqual([
      { table_name: "muscle", id: "m1" },
      { table_name: "muscle", id: "m1:1" },
      { table_name: "preference", id: "weight_unit" },
    ]);
    expect(await db.selectFrom("_undo").selectAll().execute()).toEqual([]);
  });
});
