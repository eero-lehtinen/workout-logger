import { useEffect, useSyncExternalStore } from "react";
import { getAccount } from "./account.ts";
import { apiHeaders, SERVER_URL } from "./server.ts";

/** `GET /api/me/usage` (docs/accounts.md#quotas). Limits are null when unlimited. */
export interface Usage {
  day: string;
  bytesWritten: number;
  bytesPerDay: number | null;
  storedBytes: number;
  maxBytes: number | null;
  snapshots: number;
  snapshotsPerDay: number | null;
}

let usage: Usage | null = null;
const listeners = new Set<() => void>();

function set(next: Usage | null) {
  usage = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The signed-in user's usage, refreshed after each sync run while mounted.
 * The sync runner fetches it at startup so Settings doesn't open without it.
 */
export function useUsage(syncing: boolean): Usage | null {
  useEffect(() => {
    if (!syncing) void refreshUsage();
  }, [syncing]);
  return useSyncExternalStore(subscribe, () => usage);
}

/** For stories. */
export function setUsageForStory(next: Usage | null) {
  fixedForStory = true;
  set(next);
}

let fixedForStory = false;

export async function refreshUsage(): Promise<void> {
  if (fixedForStory) return;
  if (getAccount().status !== "signed-in") {
    set(null);
    return;
  }
  try {
    const res = await fetch(`${SERVER_URL}/api/me/usage`, {
      headers: await apiHeaders(),
    });
    if (res.ok) set((await res.json()) as Usage);
  } catch {
    // Offline: keep the last known usage.
  }
}

/**
 * Which limit refused changes: the one with less room left. The server
 * rejects a change that doesn't fit before either is quite full.
 */
export function pausedBy(value: Usage): "daily" | "storage" {
  const daily =
    value.bytesPerDay === null
      ? Number.POSITIVE_INFINITY
      : value.bytesPerDay - value.bytesWritten;
  const storage =
    value.maxBytes === null
      ? Number.POSITIVE_INFINITY
      : value.maxBytes - value.storedBytes;
  return storage < daily ? "storage" : "daily";
}
