import { Button } from "../../components/button.tsx";
import { useDbQuery } from "../../db/react.tsx";
import { formatAgo, formatBytes } from "../../lib/format.ts";
import { type SyncState, syncNow } from "../../lib/sync.ts";
import { pausedBy, type Usage, useUsage } from "../../lib/usage.ts";
import { useNow } from "../../lib/use-now.ts";
import { Row } from "./settings-rows.tsx";

/** The last sync, what is waiting, and why sync is stuck, if it is. */
export function SyncRows(props: { sync: SyncState }) {
  const { sync } = props;
  const { unsynced, lastSyncAt } = useDbQuery("syncStatus");
  const usage = useUsage(sync.running);
  const now = useNow(30_000);
  const last =
    lastSyncAt === null
      ? "Not synced yet."
      : `Synced ${formatAgo(lastSyncAt, now)}.`;
  const pending =
    unsynced === 0
      ? ""
      : ` ${unsynced} ${unsynced === 1 ? "change" : "changes"} not synced yet.`;
  return (
    <>
      <Row label="Sync" hint={`${problem(sync, usage) ?? last}${pending}`}>
        <Button disabled={sync.running} onClick={() => void syncNow()}>
          {sync.running ? "Syncing…" : "Sync now"}
        </Button>
      </Row>
      {usage && <UsageRow usage={usage} />}
    </>
  );
}

function problem(sync: SyncState, usage: Usage | null): string | null {
  if (sync.failure === "account_disabled")
    return "This account is disabled. Your data stays on this device; sync resumes if the owner enables it.";
  if (sync.updateRequired) return "Update the app to keep syncing.";
  if (sync.failure === "offline")
    return "Offline; syncs when the server can be reached.";
  if (sync.failure === "server")
    return "The last sync failed; it is retried every minute.";
  if (sync.failure === "rate_limited")
    return "Too many requests to the server; sync tries again in a minute.";
  if (sync.failure === "quota")
    return "Sync paused: this device downloaded everything too often today. It resumes tomorrow.";
  if (sync.rejected.quota) {
    return usage && pausedBy(usage) === "storage"
      ? "Sync paused: your server storage is full. Ask the owner for more."
      : "Sync paused: today's upload limit is reached. It resumes tomorrow.";
  }
  if (
    sync.rejected.conflict ||
    sync.rejected.invalid ||
    sync.rejected.too_large
  ) {
    return "The server refused some changes. They stay on this device.";
  }
  return null;
}

function UsageRow(props: { usage: Usage }) {
  const { usage } = props;
  const of = (used: number, limit: number | null) =>
    limit === null
      ? formatBytes(used)
      : `${formatBytes(used)} of ${formatBytes(limit)}`;
  const today =
    usage.exemptUntil !== null
      ? `${formatBytes(usage.bytesWritten)}, no limit for now`
      : of(usage.bytesWritten, usage.bytesPerDay);
  return (
    <Row
      label="Server storage"
      hint={`${of(usage.storedBytes, usage.maxBytes)} stored. Uploaded today: ${today}.`}
    />
  );
}
