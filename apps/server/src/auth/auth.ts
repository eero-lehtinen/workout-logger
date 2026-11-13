import {
  APIError,
  type BetterAuthOptions,
  betterAuth,
  type GenericEndpointContext,
  getCurrentAdapter,
} from "better-auth";
import { bearer } from "better-auth/plugins/bearer";
import type { GoogleOptions } from "better-auth/social-providers";
import { type Kysely, sql } from "kysely";
import { accountBanKey, emailBanKey } from "../ban.ts";

export type Role = "owner" | "user";

export const SIGN_IN_PROVIDERS = ["google", "github"] as const;
export type SignInProvider = (typeof SIGN_IN_PROVIDERS)[number];

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

export type SignInClients = Partial<Record<SignInProvider, OAuthClient>>;

export interface AuthSettings {
  db: Kysely<never>;
  publicUrl: string;
  secret: string;
  signIn: SignInClients;
  /**
   * The account cap, the owner included (docs/accounts.md#account-cap). From
   * memory: the sign-up hook runs inside Better Auth's transaction, which
   * holds the one connection, so a query of our own there would wait for it
   * forever.
   */
  maxAccounts: () => number;
  /**
   * Whether sign-up refuses a ban key (docs/accounts.md#bans). From memory,
   * for the same reason as `maxAccounts`.
   */
  isBanned: (key: string) => boolean;
  /** Better Auth's limiter; off in tests, where every request has the same IP. */
  rateLimit?: boolean;
  /** Tests stand in for Google's token check and profile. */
  googleOverrides?: Pick<GoogleOptions, "verifyIdToken" | "getUserInfo">;
}

const DAY_S = 24 * 60 * 60;

/** Better Auth's configuration. See docs/accounts.md#login. */
export function authOptions(settings: AuthSettings) {
  const { google, github } = settings.signIn;
  return {
    appName: "Workout Logger",
    baseURL: settings.publicUrl,
    basePath: "/api/auth",
    secret: settings.secret,
    // Real transactions: Better Auth creates a user and its provider account
    // in one, and the account cap's count must see a sign-up running beside
    // it. Every query shares the one SQLite connection, so a transaction
    // also keeps other queries out until it ends.
    database: { db: settings.db, type: "sqlite", transaction: true },
    trustedOrigins: [settings.publicUrl],
    emailAndPassword: { enabled: false },
    // A sign-in with a provider account that has no account here creates
    // one, up to the cap. A first sign-in with a provider links to the
    // account whose email matches the provider's verified one.
    socialProviders: {
      ...(google && {
        google: {
          ...google,
          // A phone with several Google accounts asks which one.
          prompt: "select_account",
          ...settings.googleOverrides,
        },
      }),
      ...(github && { github }),
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
          input: false,
        },
        disabled: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Runs inside the transaction that creates the user and its
          // provider account, so two sign-ups can't both take the last
          // place. A creation outside a request (`create-owner`) passes.
          async before(user, context) {
            if (!context) return;
            if (settings.isBanned(emailBanKey(user.email))) {
              throw accountDisabled();
            }
            const adapter = await getCurrentAdapter(context.context.adapter);
            const accounts = await adapter.count({ model: "user" });
            if (accounts >= settings.maxAccounts()) {
              throw new APIError("FORBIDDEN", {
                code: "signup_closed",
                message: "No new accounts at the moment",
              });
            }
          },
        },
      },
      account: {
        create: {
          // A provider account is created on sign-up, in the user's
          // transaction, and when a sign-in links it to the account with its
          // email. Its id outlasts an email change at the provider.
          async before(account) {
            if (
              settings.isBanned(
                accountBanKey(account.providerId, account.accountId),
              )
            ) {
              throw accountDisabled();
            }
          },
        },
      },
      session: {
        create: {
          // The admin page deletes a disabled user's sessions; this keeps
          // them from signing in again.
          async before(session, context) {
            if (await isDisabled(settings.db, session.userId, context)) {
              throw accountDisabled();
            }
          },
        },
      },
    },
    session: {
      // A phone may sync rarely; a session used at least every two months
      // never expires.
      expiresIn: 60 * DAY_S,
      updateAge: DAY_S,
    },
    rateLimit: {
      enabled: settings.rateLimit ?? true,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/*": { window: 60, max: 5 },
        "/callback/*": { window: 60, max: 10 },
      },
    },
    advanced: {
      // Every request comes through the Cloudflare Tunnel, which sets this
      // header at the edge (docs/deployment.md#topology).
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    plugins: [bearer()],
    telemetry: { enabled: false },
  } satisfies BetterAuthOptions;
}

export type AuthOptions = ReturnType<typeof authOptions>;

/** Also a ban's answer: to the person, a banned account is a disabled one. */
function accountDisabled() {
  return new APIError("FORBIDDEN", {
    code: "account_disabled",
    message: "This account is disabled",
  });
}

type HookContext = GenericEndpointContext | null;

/**
 * Within a Better Auth request its own adapter, which joins any transaction
 * it has open; outside one (the native-auth routes, the CLI) the server's
 * connection.
 */
async function isDisabled(
  db: Kysely<never>,
  userId: string,
  context: HookContext,
): Promise<boolean> {
  if (context) {
    const user = await context.context.internalAdapter.findUserById(userId);
    return (user as { disabled?: boolean } | null)?.disabled === true;
  }
  const { rows } = await sql<{
    disabled: number | null;
  }>`SELECT disabled FROM user WHERE id = ${userId}`.execute(db);
  return rows[0]?.disabled === 1;
}

export function createAuth(settings: AuthSettings) {
  return betterAuth(authOptions(settings));
}

export type Auth = ReturnType<typeof createAuth>;

export const PRUNE_VERIFICATIONS_JOB = "prune-verifications";

/**
 * Deletes expired verification rows. Every sign-in start stores its OAuth
 * state in one before anyone has signed in, and Better Auth deletes it only
 * when a callback looks it up.
 */
export async function pruneVerifications(
  auth: Auth,
  now: number,
): Promise<void> {
  const ctx = await auth.$context;
  await ctx.adapter.deleteMany({
    model: "verification",
    where: [{ field: "expiresAt", operator: "lt", value: new Date(now) }],
  });
}

/** The providers sign-in offers, in the order the app shows them. */
export function signInProviders(auth: Auth): SignInProvider[] {
  const enabled: Record<string, unknown> = auth.options.socialProviders;
  return SIGN_IN_PROVIDERS.filter((provider) => enabled[provider]);
}

/** What `GET /api/me` answers. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
}

/** The signed-in user of a request (cookie or bearer token), or null. */
export async function sessionUser(
  auth: Auth,
  headers: Headers,
): Promise<(SessionUser & { disabled: boolean }) | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const { id, name, email, image, role, disabled } = session.user;
  return {
    id,
    name,
    email,
    image: image ?? null,
    role: role === "owner" ? "owner" : "user",
    disabled: disabled === true,
  };
}
