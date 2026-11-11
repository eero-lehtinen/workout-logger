import { cp, mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { type Browser, devices, test } from "@playwright/test";
import { createApp } from "../../server/src/app.ts";
import { readConfig } from "../../server/src/config.ts";
import type { ServerKysely } from "../../server/src/db/database.ts";
import { openServer } from "../../server/src/startup.ts";

/**
 * A server of its own, on its own port and database, serving a copy of the
 * web build that the test may change, e.g. to stage a deploy.
 */
export async function ownServer() {
  const dir = await mkdtemp(join(tmpdir(), "workout-logger-e2e-"));
  const webRoot = join(dir, "web");
  const config = readConfig({ DATABASE_PATH: join(dir, "app.db") });
  await cp(config.webRoot, webRoot, { recursive: true });
  const { database, auth, limitCache } = await openServer(config);
  const app = createApp({
    webRoot,
    bundleRoot: config.bundleRoot,
    db: database.db,
    auth,
    limitCache,
    databasePath: config.databasePath,
    backupsConfigured: false,
  });
  const server = serve({ fetch: app.fetch, port: 0 });
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://localhost:${port}`,
    webRoot,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await database.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/** Runs `fn` on the e2e server's database, which the running server shares. */
export async function withServerDb<T>(
  fn: (db: ServerKysely) => Promise<T>,
): Promise<T> {
  const { database } = await openServer(
    readConfig({ DATABASE_PATH: process.env.E2E_DATABASE_PATH }),
  );
  try {
    return await fn(database.db);
  } finally {
    await database.close();
  }
}

/**
 * A signed-in user without an OAuth provider: the user and session go
 * straight into the server's database, and the browser sends the session
 * token as a bearer token, which the server accepts like its cookie.
 */
export async function createSession(
  email: string,
): Promise<{ token: string; userId: string }> {
  const { database, auth } = await openServer(
    readConfig({ DATABASE_PATH: process.env.E2E_DATABASE_PATH }),
  );
  try {
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.createUser(
      { email, name: "E2E", emailVerified: true },
      { method: "admin" },
    );
    const session = await ctx.internalAdapter.createSession(user.id);
    return { token: session.token, userId: user.id };
  } finally {
    await database.close();
  }
}

/** A browser context signed in with `token`. */
export async function device(browser: Browser, token: string, phone: boolean) {
  const context = await browser.newContext({
    ...(phone ? devices["Pixel 7"] : {}),
    // browser.newContext doesn't apply the config's `use`.
    baseURL: test.info().project.use.baseURL as string,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  return context.newPage();
}
