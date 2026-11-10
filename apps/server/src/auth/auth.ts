import { type BetterAuthOptions, betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins/bearer";
import type { Kysely } from "kysely";

export type Role = "owner" | "user";

export interface AuthSettings {
  db: Kysely<never>;
  publicUrl: string;
  secret: string;
  github: { clientId: string; clientSecret: string } | undefined;
  /** Better Auth's limiter; off in tests, where every request has the same IP. */
  rateLimit?: boolean;
}

const DAY_S = 24 * 60 * 60;

/** Better Auth's configuration. See docs/accounts.md#login. */
export function authOptions(settings: AuthSettings) {
  return {
    appName: "Workout Logger",
    baseURL: settings.publicUrl,
    basePath: "/api/auth",
    secret: settings.secret,
    database: { db: settings.db, type: "sqlite" },
    trustedOrigins: [settings.publicUrl],
    emailAndPassword: { enabled: false },
    socialProviders: settings.github
      ? {
          github: {
            clientId: settings.github.clientId,
            clientSecret: settings.github.clientSecret,
            // Accounts exist only through `server create-owner` (later,
            // invites). A first GitHub sign-in links to the account whose
            // email matches GitHub's (verified) profile or primary email.
            disableSignUp: true,
          },
        }
      : {},
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
