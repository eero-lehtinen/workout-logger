import { useEffect } from "react";
import { useDb } from "../db/react.tsx";
import { subscribeAccount } from "../lib/account.ts";
import { refreshOwnerStatus } from "../lib/server-status.ts";
import { startSync } from "../lib/sync.ts";
import { refreshUsage } from "../lib/usage.ts";

const OWNER_STATUS_MS = 15 * 60 * 1000;

/**
 * Syncs the open database, polls the owner's backup status, and loads the
 * account's server usage. Renders nothing.
 */
export function SyncRunner() {
  const db = useDb();
  useEffect(() => startSync(db), [db]);
  useEffect(() => {
    const refresh = () => {
      void refreshOwnerStatus();
      void refreshUsage();
    };
    refresh();
    const unsubscribe = subscribeAccount(refresh);
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
