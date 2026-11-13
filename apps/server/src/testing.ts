import type { GoogleProfile } from "better-auth/social-providers";
import { type AppOptions, createApp } from "./app.ts";
import {
  type AuthSettings,
  authOptions,
  createAuth,
  type Role,
  type SignInClients,
} from "./auth/auth.ts";
import { openDatabase } from "./db/database.ts";
import { LimitCache } from "./limit-cache.ts";
import { prepareDatabase } from "./startup.ts";

export const TEST_URL = "http://localhost:3000";

const CLIENT = { clientId: "client-id", clientSecret: "client-secret" };
const SECRET = "test-secret-that-is-long-enough-for-better-auth";

/** Better Auth's configuration for migrating a test database. */
export function testAuthOptions(db: unknown) {
  return authOptions({
    db: db as never,
    publicUrl: TEST_URL,
    secret: SECRET,
    signIn: {},
    maxAccounts: () => 100,
    isBanned: () => false,
  });
}

/**
 * Google's id-token sign-in, with the token standing for the Google
 * account's email: the real sign-in and sign-up path past the provider.
 */
const FAKE_GOOGLE: NonNullable<AuthSettings["googleOverrides"]> = {
  verifyIdToken: async () => true,
  getUserInfo: async (tokens) => {
    const email = tokens.idToken ?? "";
    return {
      user: { email, name: email, emailVerified: true },
      data: { sub: `google-${email}`, email } as GoogleProfile,
    };
  },
};

/**
 * The app on a migrated in-memory database, with Google and GitHub
 * configured; Google is never called (see `FAKE_GOOGLE`), GitHub only
 * started.
 */
export async function openTestApp(
  overrides: Partial<Omit<AppOptions, "db" | "auth">> & {
    signIn?: SignInClients;
    maxAccounts?: number;
  } = {},
) {
  const { signIn: clients, maxAccounts, ...appOverrides } = overrides;
  const publicUrl = appOverrides.publicUrl ?? TEST_URL;
  const database = openDatabase(":memory:");
  let cache: LimitCache | null = null;
  const settings: AuthSettings = {
    db: database.db as never,
    publicUrl,
    secret: SECRET,
    signIn: clients ?? { google: CLIENT, github: CLIENT },
    maxAccounts: () => cache?.maxAccounts() ?? 0,
    isBanned: (key) => cache?.isBanned(key) ?? false,
    rateLimit: false,
    googleOverrides: FAKE_GOOGLE,
  };
  await prepareDatabase(database.db, authOptions(settings), undefined);
  if (maxAccounts !== undefined) {
    await database.db
      .updateTable("limits")
      .set({ max_accounts: maxAccounts })
      .execute();
  }
  const limitCache = await LimitCache.load(database.db);
  cache = limitCache;
  const auth = createAuth(settings);
  const app = createApp({
    webRoot: "unused",
    bundleRoot: "unused",
    databasePath: ":memory:",
    ...appOverrides,
    publicUrl,
    db: database.db,
    auth,
    limitCache,
  });

  /** A user with a session, as after a sign-in with a provider. */
  async function signIn(email: string, role: Role = "user") {
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.createUser(
      { email, name: email, emailVerified: true, role },
      { method: "admin" },
    );
    const session = await ctx.internalAdapter.createSession(user.id);
    return { userId: user.id, token: session.token };
  }

  /**
   * A sign-in with the Google account of `email`, as the app's would be,
   * through Better Auth: it links or signs up like the OAuth callback.
   */
  function googleSignIn(email: string) {
    return app.request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json", origin: TEST_URL },
      body: JSON.stringify({ provider: "google", idToken: { token: email } }),
    });
  }

  return {
    app,
    auth,
    db: database.db,
    limitCache,
    signIn,
    googleSignIn,
    close: database.close,
  };
}
