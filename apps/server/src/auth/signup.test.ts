import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { createOwner } from "../cli.ts";
import type { ServerKysely } from "../db/database.ts";
import { openTestApp } from "../testing.ts";

async function count(db: ServerKysely, table: "user" | "account") {
  const { rows } = await sql<{
    n: number;
  }>`SELECT count(*) AS n FROM ${sql.table(table)}`.execute(db);
  return rows[0]?.n ?? 0;
}

describe("sign-up", () => {
  it("creates a user and its Google account below the cap", async () => {
    const { db, googleSignIn } = await openTestApp({ maxAccounts: 2 });
    const res = await googleSignIn("new@example.com");
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    expect(token).toBeTruthy();
    expect(await count(db, "user")).toBe(1);
    expect(await count(db, "account")).toBe(1);
  });

  it("is refused at the cap with signup_closed, leaving no rows", async () => {
    const { db, signIn, googleSignIn } = await openTestApp({ maxAccounts: 1 });
    await signIn("first@example.com");
    const res = await googleSignIn("second@example.com");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "signup_closed" });
    expect(await count(db, "user")).toBe(1);
    expect(await count(db, "account")).toBe(0);
  });

  it("lets only one of two concurrent sign-ups take the last place", async () => {
    const { db, signIn, googleSignIn } = await openTestApp({ maxAccounts: 2 });
    await signIn("first@example.com");
    const results = await Promise.all([
      googleSignIn("a@example.com"),
      googleSignIn("b@example.com"),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 403]);
    expect(await count(db, "user")).toBe(2);
    expect(await count(db, "account")).toBe(1);
  });

  it("still signs in an existing account at the cap", async () => {
    const { googleSignIn } = await openTestApp({ maxAccounts: 1 });
    expect((await googleSignIn("only@example.com")).status).toBe(200);
    expect((await googleSignIn("only@example.com")).status).toBe(200);
  });

  it("links a first Google sign-in to the account with that email at the cap", async () => {
    const { db, auth, googleSignIn } = await openTestApp({ maxAccounts: 1 });
    await createOwner(auth, "owner@example.com", "Owner");
    const res = await googleSignIn("owner@example.com");
    expect(res.status).toBe(200);
    expect(await count(db, "user")).toBe(1);
    expect(await count(db, "account")).toBe(1);
  });

  it("applies a cap set on the admin page to the next sign-up", async () => {
    const { db, app, signIn, googleSignIn } = await openTestApp();
    const owner = await signIn("owner@example.com", "owner");
    await signIn("first@example.com");
    const res = await app.request("/api/admin/limits", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ maxAccounts: 2 }),
    });
    expect(res.status).toBe(204);
    expect((await googleSignIn("third@example.com")).status).toBe(403);
    expect(await count(db, "user")).toBe(2);
  });

  it("defaults to 100 accounts", async () => {
    const { limitCache } = await openTestApp();
    expect(limitCache.maxAccounts()).toBe(100);
  });

  it("lets create-owner past the cap", async () => {
    const { db, signIn, auth } = await openTestApp({ maxAccounts: 1 });
    await signIn("first@example.com");
    await createOwner(auth, "owner@example.com", "Owner");
    expect(await count(db, "user")).toBe(2);
  });
});
