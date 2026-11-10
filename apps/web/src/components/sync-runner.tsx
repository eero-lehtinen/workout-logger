import { useEffect } from "react";
import { useDb } from "../db/react.tsx";
import { subscribeAccount } from "../lib/account.ts";
import { refreshOwnerStatus } from "../lib/server-status.ts";
import { startSync } from "../lib/sync.ts";

const OWNER_STATUS_MS = 15 * 60 * 1000;

/** Syncs the open database and polls the owner's backup status. Renders nothing. */
export function SyncRunner() {
  const db = useDb();
  useEffect(() => startSync(db), [db]);
  useEffect(() => {
    void refreshOwnerStatus();
    const unsubscribe = subscribeAccount(() => void refreshOwnerStatus());
    const interval = setInterval(
      () => void refreshOwnerStatus(),
      OWNER_STATUS_MS,
    );
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);
  return null;
}
