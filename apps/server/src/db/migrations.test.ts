import { describe, expect, it } from "vitest";
import { testAuthOptions as settings } from "../testing.ts";
import { openDatabase } from "./database.ts";
import { migrateServer, pendingMigrations } from "./migrations.ts";

describe("server migrations", () => {
  it("roll back a failed step, which the next start runs again", async () => {
    const { db, sqlite } = openDatabase(":memory:");
    const tables = () =>
      sqlite
        .prepare("select name from sqlite_master where type = 'table'")
        .pluck()
        .all();
    // 0003_sync_head_only creates this index as its last statement, after
    // dropping `change` and renaming `head_new`.
    sqlite.exec(
      "CREATE TABLE blocker (x); CREATE INDEX head_user_seq ON blocker (x)",
    );

    await expect(migrateServer(db, settings(db))).rejects.toThrow();
    expect(tables()).toContain("change");
    expect(tables()).not.toContain("head_new");
    expect(await pendingMigrations(db, settings(db))).toContain(
      "0003_sync_head_only",
    );

    sqlite.exec("DROP TABLE blocker");
    await migrateServer(db, settings(db));
    expect(tables()).not.toContain("change");
    expect(await pendingMigrations(db, settings(db))).toEqual([]);
  });
});
