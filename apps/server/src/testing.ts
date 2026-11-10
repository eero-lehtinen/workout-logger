import { type AppOptions, createApp } from "./app.ts";
import {
  type AuthSettings,
  authOptions,
  createAuth,
  type Role,
} from "./auth/auth.ts";
import { openDatabase } from "./db/database.ts";
import { prepareDatabase } from "./startup.ts";

export const TEST_URL = "http://localhost:3000";

/** The app on a migrated in-memory database, with GitHub configured but never called. */
export async function openTestApp(
  overrides: Partial<Omit<AppOptions, "db" | "auth">> = {},
) {
  const database = openDatabase(":memory:");
  const settings: AuthSettings = {
    db: database.db as never,
    publicUrl: TEST_URL,
    secret: "test-secret-that-is-long-enough-for-better-auth",
    github: { clientId: "client-id", clientSecret: "client-secret" },
    rateLimit: false,
  };
  await prepareDatabase(database.db, authOptions(settings), undefined);
  const auth = createAuth(settings);
  const app = createApp({
    webRoot: "unused",
    bundleRoot: "unused",
    databasePath: ":memory:",
    backupsConfigured: false,
    ...overrides,
    db: database.db,
    auth,
  });

  /** A user with a session, as after a GitHub sign-in. */
  async function signIn(email: string, role: Role = "user") {
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.createUser(
      { email, name: email, emailVerified: true, role },
      { method: "admin" },
    );
    const session = await ctx.internalAdapter.createSession(user.id);
    return { userId: user.id, token: session.token };
  }

  return { app, auth, db: database.db, signIn, close: database.close };
}
