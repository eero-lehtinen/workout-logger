import { stat, statfs } from "node:fs/promises";
import { dirname } from "node:path";
import { readEpoch } from "@workout-logger/core/sync-server";
import type { SignInProvider } from "./auth/auth.ts";
import { litestreamLastSync } from "./backup/litestream.ts";
import { type ServerKysely, syncDb } from "./db/database.ts";
import { readJob } from "./jobs.ts";

export const DAILY_COPY_JOB = "daily-db-copy";
export const COPY_REHEARSAL_JOB = "copy-rehearsal";
export const REPLICA_REHEARSAL_JOB = "replica-rehearsal";
export const TOKEN_CHECK_JOB = "token-check";

const HOUR = 60 * 60 * 1000;
/** Thresholds from docs/backups.md#visibility. */
const LITESTREAM_MAX_AGE = HOUR;
const DAILY_COPY_MAX_AGE = 48 * HOUR;
const CHECK_MAX_AGE = 48 * HOUR;

export interface BackupLayer {
  /** False when the layer isn't configured on this server. */
  configured: boolean;
  lastOkAt: number | null;
  stale: boolean;
  lastError?: string | null;
  /**
   * The last run failed and that needs attention now, before the layer is
   * stale. Only the checks set it: a failed restore rehearsal means a backup
   * that doesn't restore, and a failed token check a token that can do too
   * much, while a failed daily copy is retried the next day.
   */
  failed?: boolean;
}

/** What anyone, e.g. the uptime monitor, sees. */
export interface PublicStatus {
  version: string;
  commit: string | null;
  /** False when a configured backup layer is stale. */
  backupsOk: boolean;
  /** The sign-in buttons the app shows. */
  signIn: SignInProvider[];
}

/** What the owner sees in addition. */
export interface OwnerStatus extends PublicStatus {
  epoch: string;
  databaseBytes: number;
  freeDiskBytes: number | null;
  backups: {
    litestream: BackupLayer;
    dailyCopy: BackupLayer;
    copyRehearsal: BackupLayer;
    replicaRehearsal: BackupLayer;
    tokenCheck: BackupLayer;
  };
}

export interface StatusSource {
  db: ServerKysely;
  version: string;
  commit: string | null;
  databasePath: string;
  backupsConfigured: boolean;
  litestreamSocket: string | undefined;
  replicaRehearsalConfigured: boolean;
  signIn: SignInProvider[];
  now?: () => number;
}

export async function backupLayers(
  source: StatusSource,
): Promise<OwnerStatus["backups"]> {
  const now = (source.now ?? Date.now)();
  const litestreamAt = source.litestreamSocket
    ? await litestreamLastSync(source.litestreamSocket, source.databasePath)
    : null;
  const copy = await readJob(source.db, DAILY_COPY_JOB);
  const layer = (
    configured: boolean,
    lastOkAt: number | null,
    maxAge: number,
  ): BackupLayer => ({
    configured,
    lastOkAt,
    stale: configured && (lastOkAt === null || now - lastOkAt > maxAge),
  });
  const check = async (
    job: string,
    configured: boolean,
  ): Promise<BackupLayer> => {
    const state = await readJob(source.db, job);
    return {
      ...layer(configured, state?.lastOkAt ?? null, CHECK_MAX_AGE),
      lastError: state?.lastError ?? null,
      failed: configured && Boolean(state?.lastError),
    };
  };
  return {
    litestream: layer(
      source.litestreamSocket !== undefined,
      litestreamAt,
      LITESTREAM_MAX_AGE,
    ),
    dailyCopy: {
      ...layer(
        source.backupsConfigured,
        copy?.lastOkAt ?? null,
        DAILY_COPY_MAX_AGE,
      ),
      lastError: copy?.lastError ?? null,
    },
    copyRehearsal: await check(COPY_REHEARSAL_JOB, source.backupsConfigured),
    replicaRehearsal: await check(
      REPLICA_REHEARSAL_JOB,
      source.replicaRehearsalConfigured,
    ),
    tokenCheck: await check(
      TOKEN_CHECK_JOB,
      source.backupsConfigured && source.replicaRehearsalConfigured,
    ),
  };
}

export async function publicStatus(
  source: StatusSource,
): Promise<PublicStatus> {
  const backups = await backupLayers(source);
  return summary(source, backups);
}

export async function ownerStatus(source: StatusSource): Promise<OwnerStatus> {
  const backups = await backupLayers(source);
  return {
    ...summary(source, backups),
    epoch: await readEpoch(syncDb(source.db)),
    databaseBytes: await databaseBytes(source.databasePath),
    freeDiskBytes: await freeDisk(source.databasePath),
    backups,
  };
}

function summary(
  source: StatusSource,
  backups: OwnerStatus["backups"],
): PublicStatus {
  return {
    version: source.version,
    commit: source.commit,
    backupsOk: Object.values(backups).every(
      (layer) => !layer.stale && !layer.failed,
    ),
    signIn: source.signIn,
  };
}

async function databaseBytes(path: string): Promise<number> {
  let total = 0;
  for (const file of [path, `${path}-wal`]) {
    total += await stat(file).then(
      (s) => s.size,
      () => 0,
    );
  }
  return total;
}

async function freeDisk(path: string): Promise<number | null> {
  try {
    const fs = await statfs(dirname(path));
    return fs.bavail * fs.bsize;
  } catch {
    return null;
  }
}
