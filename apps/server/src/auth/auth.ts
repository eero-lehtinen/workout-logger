import { type BetterAuthOptions, betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins/bearer";
import type { Kysely } from "kysely";

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
  /** Better Auth's limiter; off in tests, where every request has the same IP. */
  rateLimit?: boolean;
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
    database: { db: settings.db, type: "sqlite" },
    trustedOrigins: [settings.publicUrl],
    emailAndPassword: { enabled: false },
    // Accounts exist only through `server create-owner` for now. A first
    // sign-in with a provider links to the account whose email matches the
    // provider's verified one.
    socialProviders: {
      ...(google && {
        google: {
          ...google,
          // A phone with several Google accounts asks which one.
          prompt: "select_account",
          disableSignUp: true,
        },
      }),
      ...(github && { github: { ...github, disableSignUp: true } }),
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
          input: false,
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

export function createAuth(settings: AuthSettings) {
  return betterAuth(authOptions(settings));
}

export type Auth = ReturnType<typeof createAuth>;

/** The providers sign-in offers, in the order the app shows them. */
export function signInProviders(auth: Auth): SignInProvider[] {
  const enabled: Record<string, unknown> = auth.options.socialProviders;
  return SIGN_IN_PROVIDERS.filter((provider) => enabled[provider]);
}

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
): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const { id, name, email, image, role } = session.user;
  return {
    id,
    name,
    email,
    image: image ?? null,
    role: role === "owner" ? "owner" : "user",
  };
}
