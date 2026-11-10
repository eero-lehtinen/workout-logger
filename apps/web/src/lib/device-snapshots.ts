import { Directory, Filesystem } from "@capacitor/filesystem";
import { effectiveSessionEnd, type SessionSummary } from "@workout-logger/core";
import { useSyncExternalStore } from "react";

/**
 * On-device snapshot files (docs/backups.md#layers), Android only: the
 * shared Documents folder, so they are visible in a file manager and survive
 * an uninstall. From Android 11 on the app needs no permission for files it
 * created itself, and sees no others: files left by an earlier install stay
 * but are never pruned.
 */
export const SNAPSHOT_FOLDER = "WorkoutLogger";
const KEPT = 10;
const PREFIX = "workout-logger-";
const SUFFIX = ".sqlite3";
const STORAGE_KEY = "device-snapshot-at";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** When the last snapshot file was written, or null if never on this install. */
export function lastSnapshotAt(): number | null {
  try {
    const at = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(at) && at > 0 ? at : null;
  } catch {
    return null;
  }
}

export function useLastSnapshotAt(): number | null {
  return useSyncExternalStore(subscribe, lastSnapshotAt);
}

/** Sorts by time as plain text; no ":" because Android refuses it in file names. */
export function snapshotFileName(at: Date): string {
  const stamp = at.toISOString().slice(0, 19).replaceAll(":", "-");
  return `${PREFIX}${stamp}${SUFFIX}`;
}

/** The files to delete so that only the newest `kept` snapshots remain. */
export function snapshotsToPrune(names: string[], kept = KEPT): string[] {
  return names
    .filter((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX))
    .sort()
    .reverse()
    .slice(kept);
}

/**
 * Whether a session has ended since the last snapshot file. Never while a
 * session runs: the snapshot would miss the rest of it.
 */
export function snapshotDue(
  sessions: SessionSummary[],
  now: number,
  idleThresholdS: number,
  lastSnapshotAt: number | null,
): boolean {
  let latestEnd: number | null = null;
  for (const session of sessions) {
    const end = effectiveSessionEnd(
      {
        started_at: session.startedAt,
        ended_at: session.endedAt,
        end_reason: session.endReason,
      },
      session.lastSetAt,
      now,
      idleThresholdS * 1000,
    );
    if (end.running) return false;
    latestEnd = Math.max(latestEnd ?? 0, end.endedAt);
  }
  return latestEnd !== null && latestEnd > (lastSnapshotAt ?? 0);
}

/** The bridge carries binary data as base64. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // In chunks: one call with every byte as an argument overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Writes a snapshot file and prunes old ones. Resolves to the file's path
 * as the user finds it in a file manager.
 */
export async function writeDeviceSnapshot(bytes: Uint8Array): Promise<string> {
  const now = new Date();
  const name = snapshotFileName(now);
  await Filesystem.writeFile({
    directory: Directory.Documents,
    path: `${SNAPSHOT_FOLDER}/${name}`,
    data: toBase64(bytes),
    recursive: true,
  });
  try {
    localStorage.setItem(STORAGE_KEY, String(now.getTime()));
  } catch {
    // Without it the next start writes another snapshot, which is harmless.
  }
  for (const listener of listeners) listener();

  const { files } = await Filesystem.readdir({
    directory: Directory.Documents,
    path: SNAPSHOT_FOLDER,
  });
  for (const old of snapshotsToPrune(files.map((file) => file.name))) {
    await Filesystem.deleteFile({
      directory: Directory.Documents,
      path: `${SNAPSHOT_FOLDER}/${old}`,
    });
  }
  return `Documents/${SNAPSHOT_FOLDER}/${name}`;
}
