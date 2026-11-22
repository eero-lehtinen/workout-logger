import { formatHlc, SCHEMA_VERSION } from "@workout-logger/core";
import { push } from "@workout-logger/core/sync-server";
import { describe, expect, it } from "vitest";
import { exportAccount } from "./account-export.ts";
import { banAccount } from "./ban.ts";
import { setEmail } from "./cli.ts";
import { syncDb } from "./db/database.ts";
import { openTestApp } from "./testing.ts";

async function setup() {
  const test = await openTestApp();
  const users = [];
  for (const name of ["alice", "bob"]) {
    const user = await test.signIn(`${name}@example.com`);
    const ctx = await test.auth.$context;
    await ctx.internalAdapter.createAccount({
      userId: user.userId,
      providerId: "google",
      accountId: `g-${name}`,
      accessToken: `secret-access-${name}`,
      idToken: `secret-id-${name}`,
    });
    await push(
      syncDb(test.db),
      user.userId,
      {
        device_id: "aaaaaaaaaaaa",
        client_version: "test",
        changes: [
          {
            table: "setting",
            id: "note",
            hlc: formatHlc({
              wall: Date.now(),
              counter: 0,
              node: "aaaaaaaaaaaa",
            }),
            deleted: false,
            v: SCHEMA_VERSION,
            data: { value_json: `"${name}'s note"` },
          },
        ],
      },
      { now: Date.now() },
    );
    await test.db
      .insertInto("usage")
      .values({
        user_id: user.userId,
        day: "2026-11-11",
        bytes_written: 1,
        snapshots: 0,
      })
      .execute();
    users.push(user);
  }
  const [alice, bob] = users as [(typeof users)[0], (typeof users)[0]];
  return { ...test, alice, bob };
}

describe("exportAccount", () => {
  it("holds one person's records and no credentials", async () => {
    const { db, alice } = await setup();
    for (const who of [alice.userId, "Alice@Example.com"]) {
      const data = await exportAccount(db, who);
      expect(data.user).toMatchObject({ email: "alice@example.com" });
      expect(data.providerAccounts).toMatchObject([
        { providerId: "google", accountId: "g-alice" },
      ]);
      expect(data.sessions).toHaveLength(1);
      expect(data.sessions[0]).toHaveProperty("ipAddress");
      expect(data.usage).toMatchObject([{ day: "2026-11-11" }]);
      expect(data.rows).toMatchObject([
        { table_name: "setting", data: { value_json: `"alice's note"` } },
      ]);
      const text = JSON.stringify(data);
      expect(text).not.toContain("bob");
      expect(text).not.toContain("secret-");
      expect(text).not.toContain(alice.token);
    }
  });

  it("finds what a ban kept of a deleted account", async () => {
    const { db, alice } = await setup();
    await banAccount(db, alice.userId, Date.now());
    const data = await exportAccount(db, "alice@example.com");
    expect(data.user).toBeNull();
    expect(data.ban).toMatchObject({ email: "alice@example.com" });
    expect(data.banKeys).toHaveLength(2);
    expect(data.rows).toEqual([]);
  });

  it("leaves out another person's ban with the same email", async () => {
    const { db, auth, alice, bob } = await setup();
    await banAccount(db, alice.userId, Date.now());
    await setEmail(auth, bob.userId, "alice@example.com");
    const data = await exportAccount(db, "alice@example.com");
    expect(data.user).toMatchObject({ id: bob.userId });
    expect(data.ban).toBeNull();
    expect(data.banKeys).toEqual([]);
  });

  it("refuses someone the server doesn't know", async () => {
    const { db } = await setup();
    await expect(exportAccount(db, "nobody@example.com")).rejects.toThrow(
      "no account or ban",
    );
  });
});
