import { useTranslation } from "react-i18next";
import { Button } from "../../components/button.tsx";
import { useDbQuery } from "../../db/react.tsx";
import { i18n } from "../../i18n/index.ts";
import { formatAgo, formatBytes } from "../../lib/format.ts";
import { type SyncState, syncNow } from "../../lib/sync.ts";
import { pausedBy, type Usage, useUsage } from "../../lib/usage.ts";
import { useNow } from "../../lib/use-now.ts";
import { Row } from "./settings-rows.tsx";

/** The last sync, what is waiting, and why sync is stuck, if it is. */
export function SyncRows(props: { sync: SyncState }) {
  const { t } = useTranslation();
  const { sync } = props;
  const { unsynced, lastSyncAt } = useDbQuery("syncStatus");
  const usage = useUsage(sync.running);
  const now = useNow(30_000);
  const last =
    lastSyncAt === null
      ? t("settings.sync.notYet")
      : t("settings.sync.synced", { ago: formatAgo(lastSyncAt, now) });
  const pending =
    unsynced === 0 ? "" : ` ${t("settings.sync.pending", { count: unsynced })}`;
  return (
    <>
      <Row
        label={t("settings.sync.label")}
        hint={`${problem(sync, usage) ?? last}${pending}`}
      >
        <Button disabled={sync.running} onClick={() => void syncNow()}>
          {sync.running ? t("settings.sync.syncing") : t("settings.sync.now")}
        </Button>
      </Row>
      <UsageRow usage={usage} />
    </>
  );
}

function problem(sync: SyncState, usage: Usage | null): string | null {
  if (sync.failure === "account_disabled")
    return i18n.t("settings.sync.problem.accountDisabled");
  if (sync.updateRequired)
    return i18n.t("settings.sync.problem.updateRequired");
  if (sync.failure === "offline")
    return i18n.t("settings.sync.problem.offline");
  if (sync.failure === "server") return i18n.t("settings.sync.problem.server");
  if (sync.failure === "rate_limited")
    return i18n.t("settings.sync.problem.rateLimited");
  if (sync.failure === "quota")
    return i18n.t("settings.sync.problem.downloadQuota");
  if (sync.rejected.quota) {
    return usage && pausedBy(usage) === "storage"
      ? i18n.t("settings.sync.problem.storageFull")
      : i18n.t("settings.sync.problem.uploadLimit");
  }
  if (
    sync.rejected.conflict ||
    sync.rejected.invalid ||
    sync.rejected.too_large
  ) {
    return i18n.t("settings.sync.problem.refused");
  }
  return null;
}

/**
 * Shown with placeholders until the usage loads, one line per fact, so the
 * row's height doesn't change when it arrives.
 */
function UsageRow(props: { usage: Usage | null }) {
  const { t } = useTranslation();
  const { usage } = props;
  const of = (used: number, limit: number | null) =>
    limit === null
      ? formatBytes(used)
      : t("settings.sync.usage.of", {
          used: formatBytes(used),
          limit: formatBytes(limit),
        });
  const stored = usage ? `${of(usage.storedBytes, usage.maxBytes)}.` : "…";
  const today = !usage
    ? "…"
    : usage.exemptUntil !== null
      ? `${t("settings.sync.usage.noLimit", { used: formatBytes(usage.bytesWritten) })}.`
      : `${of(usage.bytesWritten, usage.bytesPerDay)}.`;
  return (
    <Row
      label={t("settings.sync.usage.label")}
      hint={
        <>
          <span className="block">
            {t("settings.sync.usage.stored", { value: stored })}
          </span>
          <span className="block">
            {t("settings.sync.usage.uploadedToday", { value: today })}
          </span>
        </>
      }
    />
  );
}
