import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { createKysely } from "../db/driver.ts";
import { openNodeDriver } from "../db/node-driver.ts";
import { SchemaTooNewError } from "../migrations/runner.ts";
import type { UntypedKysely } from "../migrations/types.ts";
import { SCHEMA_VERSION } from "../schema/tables.ts";
import { dumpSyncedTables, openTestStore } from "../testing.ts";
import {
  InvalidSnapshotError,
  mergeSnapshot,
  readSnapshot,
  replaceWithSnapshot,
  writeSnapshot,
} from "./snapshot.ts";

const T0 = 1_760_000_000_000;

function emptyDb(): UntypedKysely {
  return createKysely(openNodeDriver());
}

const metric = (name: string) =>
  ({ name, unit: "cm", position: "a0", archived: 0 }) as const;

async function exported() {
  const source = await openTestStore({ now: () => T0 });
  const kept = await source.write((w) => w.insert("metric", metric("Arm")));
  const removed = await source.write((w) =>
    w.insert("metric", metric("Waist")),
  );
  await source.write((w) => w.delete("metric", removed));
  const file = emptyDb();
  const meta = await writeSnapshot(source, file);
  return { source, file, meta, kept, removed };
}

describe("snapshot", () => {
  it("round-trips synced rows, tombstones included, with meta", async () => {
    const { source, file, meta } = await exported();
    expect(meta).toEqual({
      schemaVersion: SCHEMA_VERSION,
      createdAt: T0,
      source: "device",
      serverEpoch: null,
    });
    const { rows } = await readSnapshot(file);
    expect(rows.filter((r) => r.table === "metric")).toHaveLength(2);

    const target = await openTestStore();
    expect(await mergeSnapshot(target, rows)).toEqual({
      written: 2,
      deleted: 0,
      undoTx: null,
    });
    expect(await dumpSyncedTables(target.db as never)).toEqual(
      await dumpSyncedTables(source.db as never),
    );
  });

  it("merges by LWW: newer local edits survive and winners are queued", async () => {
    const { file, kept } = await exported();
    const { rows } = await readSnapshot(file);
    const target = await openTestStore({ now: () => T0 + 1000 });
    await mergeSnapshot(target, rows);
    await target.db.deleteFrom("_outbox").execute();
    await target.write((w) => w.update("metric", kept, { name: "Biceps" }));

    expect(await mergeSnapshot(target, rows)).toEqual({
      written: 0,
      deleted: 0,
      undoTx: null,
    });
    const row = await target.db
      .selectFrom("metric")
      .select("name")
      .where("id", "=", kept)
      .executeTakeFirst();
    expect(row?.name).toBe("Biceps");
  });

  it("replaces: writes snapshot rows with fresh HLCs and deletes the rest", async () => {
    const { file, kept } = await exported();
    const { rows } = await readSnapshot(file);
    const target = await openTestStore({ now: () => T0 + 5000 });
    await mergeSnapshot(target, rows);
    await target.write((w) => w.update("metric", kept, { name: "Biceps" }));
    await target.write((w) => w.insert("metric", metric("Calf")));

    expect(await replaceWithSnapshot(target, rows)).toMatchObject({
      written: 1,
      deleted: 1,
    });
    const live = await target.db
      .selectFrom("metric")
      .select(["id", "name"])
      .where("deleted", "=", 0)
      .execute();
    expect(live).toEqual([{ id: kept, name: "Arm" }]);

    expect(await target.undo()).toBe(true);
    const restored = await target.db
      .selectFrom("metric")
      .select("name")
      .where("deleted", "=", 0)
      .orderBy("name")
      .execute();
    expect(restored.map((r) => r.name)).toEqual(["Biceps", "Calf"]);
  });

  it("refuses files that aren't snapshots or come from a newer app", async () => {
    await expect(readSnapshot(emptyDb())).rejects.toThrow(InvalidSnapshotError);
    const { file } = await exported();
    await sql`update meta set value = ${String(SCHEMA_VERSION + 1)} where key = 'schema_version'`.execute(
      file,
    );
    await expect(readSnapshot(file)).rejects.toThrow(SchemaTooNewError);
  });
});
