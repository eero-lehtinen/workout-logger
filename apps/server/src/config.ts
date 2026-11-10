import { fileURLToPath } from "node:url";
import type { R2Config } from "./backup/r2.ts";

/** Server settings from the environment. See docs/deployment.md#configuration. */
export interface ServerConfig {
  port: number;
  webRoot: string;
  commit: string | undefined;
  databasePath: string;
  /** The origin users reach, e.g. `https://lift.eerolehtinen.fi`. */
  publicUrl: string;
  authSecret: string;
  github: { clientId: string; clientSecret: string } | undefined;
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

  const github =
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
        }
      : undefined;

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
    commit: env.GIT_COMMIT || undefined,
    databasePath: env.DATABASE_PATH ?? "data/app.db",
    publicUrl: env.PUBLIC_URL ?? `http://localhost:${port}`,
    authSecret,
    github,
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
