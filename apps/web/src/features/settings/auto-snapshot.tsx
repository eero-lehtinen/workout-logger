import { useEffect } from "react";
import { toasts } from "../../components/toasts.tsx";
import { useDb, useDbQuery } from "../../db/react.tsx";
import {
  snapshotDue,
  useLastSnapshotAt,
  writeDeviceSnapshot,
} from "../../lib/device-snapshots.ts";
import { useNow } from "../../lib/use-now.ts";
import { RECENT_LIMIT } from "../session/running.ts";

let saving = false;

/**
 * Android only: writes a snapshot file after each session ends
 * (docs/backups.md#layers), or on the next start if the app wasn't open
 * when the session idled out. A failed write is retried on the next start.
 */
export function AutoSnapshot() {
  const db = useDb();
  const sessions = useDbQuery("recentSessions", { limit: RECENT_LIMIT });
  const settings = useDbQuery("settings");
  const now = useNow(15_000);
  const due = snapshotDue(
    sessions,
    now,
    settings.idle_threshold_s,
    useLastSnapshotAt(),
  );

  useEffect(() => {
    if (!due || saving) return;
    saving = true;
    db.exportSnapshot()
      .then(writeDeviceSnapshot)
      .catch((error) => {
        toasts.add({
          title: "Couldn't save the snapshot file",
          description: error instanceof Error ? error.message : String(error),
          type: "error",
        });
      })
      .finally(() => {
        saving = false;
      });
  }, [due, db]);

  return null;
}
