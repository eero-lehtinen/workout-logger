import type { TFunction } from "i18next";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useDbQuery } from "../db/react.tsx";
import { getAccount, useAccount } from "./account.ts";
import { apiHeaders, SERVER_URL } from "./server.ts";
import { useNow } from "./use-now.ts";

/** One backup layer as `/api/status` reports it to the owner. */
export interface BackupLayer {
  configured: boolean;
  lastOkAt: number | null;
  stale: boolean;
  lastError?: string | null;
}

export interface OwnerStatus {
  backupsOk: boolean;
  databaseBytes: number;
  freeDiskBytes: number | null;
  backups: { litestream: BackupLayer; dailyCopy: BackupLayer };
}

let status: OwnerStatus | null = null;
const listeners = new Set<() => void>();

function set(next: OwnerStatus | null) {
  status = next;
  for (const listener of listeners) listener();
}

export function useOwnerStatus(): OwnerStatus | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => status,
  );
}

/** For stories. */
export function setOwnerStatusForStory(next: OwnerStatus | null) {
  set(next);
}

/** The owner's view of the server's backups (docs/backups.md#visibility). */
export async function refreshOwnerStatus(): Promise<void> {
  const account = getAccount();
  if (account.status !== "signed-in" || account.user.role !== "owner") {
    set(null);
    return;
  }
  try {
    const res = await fetch(`${SERVER_URL}/api/status`, {
      headers: await apiHeaders(),
    });
    if (!res.ok) return;
    const body = (await res.json()) as Partial<OwnerStatus>;
    if (body.backups) set(body as OwnerStatus);
  } catch {
    // Offline: keep the last known status.
  }
}

const DAY = 24 * 60 * 60 * 1000;
/** docs/backups.md#visibility */
const SYNC_WARNING_AGE = 3 * DAY;
/** About 4 GB of R2 once retention fills (docs/accounts.md#account-cap). */
export const DATABASE_WARNING_BYTES = 700 * 1024 * 1024;

/**
 * What the warning badge on Settings is for, or null: changes that haven't
 * reached the server for days, or, for the owner, a stale server backup.
 */
export function useBackupWarning(): string | null {
  // `t`, not `i18n.t`: the badge lives outside the screen that remounts on a
  // language change, and the compiler caches a call that has no inputs.
  const { t } = useTranslation();
  const account = useAccount();
  const sync = useDbQuery("syncStatus");
  const owner = useOwnerStatus();
  const now = useNow(60_000);
  if (account.status !== "signed-in") return null;
  if (
    sync.unsynced > 0 &&
    (sync.lastSyncAt === null || now - sync.lastSyncAt > SYNC_WARNING_AGE)
  ) {
    return t("ui.backupWarning.unsynced");
  }
  return owner && ownerWarning(owner, t);
}

/** What on the server needs the owner's attention, or null. */
export function ownerWarning(owner: OwnerStatus, t: TFunction): string | null {
  if (!owner.backupsOk) return t("ui.backupWarning.backupStale");
  if (owner.databaseBytes > DATABASE_WARNING_BYTES) {
    return t("ui.backupWarning.databaseLarge");
  }
  return null;
}
