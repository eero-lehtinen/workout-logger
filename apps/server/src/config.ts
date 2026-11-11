import { fileURLToPath } from "node:url";
import {
  SIGN_IN_PROVIDERS,
  type SignInClients,
  type SignInProvider,
} from "./auth/auth.ts";
import type { R2Config } from "./backup/r2.ts";

/** Server settings from the environment. See docs/deployment.md#configuration. */
export interface ServerConfig {
  port: number;
  webRoot: string;
  bundleRoot: string;
  commit: string | undefined;
  databasePath: string;
  /** The origin users reach, e.g. `https://lift.eerolehtinen.fi`. */
  publicUrl: string;
  authSecret: string;
  signIn: SignInClients;
  /** Listed in `SIGN_IN_PROVIDERS` without credentials; only outside production. */
  signInMissing: SignInProvider[];
  /** Android apps below this version get 426. */
  minClientVersion: string | undefined;
  /** The `wl-backups` bucket; unset turns the DB copies off. */
  backups: R2Config | undefined;
  /** Litestream's control socket, for the replica's freshness. */
  litestreamSocket: string | undefined;
  releases: { repository: string; token: string } | undefined;
}

const DEV_SECRET = "development-only-secret-not-for-production";
export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === "production";
  const port = Number(env.PORT ?? 3000);
  const authSecret = env.AUTH_SECRET ?? (production ? undefined : DEV_SECRET);
  if (!authSecret) throw new Error("AUTH_SECRET is required in production");

  const signIn: SignInClients = {};
  const signInMissing: SignInProvider[] = [];
  for (const name of (env.SIGN_IN_PROVIDERS || "google").split(",")) {
    const provider = name.trim();
    if (!provider) continue;
    if (!isSignInProvider(provider)) {
      throw new Error(`SIGN_IN_PROVIDERS: unknown provider "${provider}"`);
    }
    const prefix = provider.toUpperCase();
    const clientId = env[`${prefix}_CLIENT_ID`];
    const clientSecret = env[`${prefix}_CLIENT_SECRET`];
    if (clientId && clientSecret) {
      signIn[provider] = { clientId, clientSecret };
    } else if (production) {
      throw new Error(
        `${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET are required for SIGN_IN_PROVIDERS=${provider}`,
      );
    } else {
      signInMissing.push(provider);
    }
  }

  const backups =
    env.BACKUP_R2_ENDPOINT &&
    env.BACKUP_R2_BUCKET &&
    env.BACKUP_R2_ACCESS_KEY_ID &&
    env.BACKUP_R2_SECRET_ACCESS_KEY
      ? {
          endpoint: env.BACKUP_R2_ENDPOINT,
          bucket: env.BACKUP_R2_BUCKET,
          accessKeyId: env.BACKUP_R2_ACCESS_KEY_ID,
          secretAccessKey: env.BACKUP_R2_SECRET_ACCESS_KEY,
        }
      : undefined;

  return {
    port,
    webRoot:
      env.WEB_ROOT ?? fileURLToPath(new URL("../../web/dist", import.meta.url)),
    bundleRoot:
      env.BUNDLE_ROOT ??
      fileURLToPath(new URL("../../web/live-bundle", import.meta.url)),
    commit: env.GIT_COMMIT || undefined,
    databasePath: env.DATABASE_PATH ?? "data/app.db",
    publicUrl: env.PUBLIC_URL ?? `http://localhost:${port}`,
    authSecret,
    signIn,
    signInMissing,
    minClientVersion: env.MIN_CLIENT_VERSION || undefined,
    backups,
    litestreamSocket: env.LITESTREAM_SOCKET || undefined,
    releases: env.GITHUB_RELEASES_TOKEN
      ? {
          repository:
            env.GITHUB_RELEASES_REPOSITORY ?? "eero-lehtinen/workout-logger",
          token: env.GITHUB_RELEASES_TOKEN,
        }
      : undefined,
  };
}

function isSignInProvider(name: string): name is SignInProvider {
  return (SIGN_IN_PROVIDERS as readonly string[]).includes(name);
}
