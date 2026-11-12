import type { UseQueryResult } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useTranslation } from "react-i18next";
import type { BackupStorage } from "../../lib/admin-api.ts";
import { formatAgo, formatBytes } from "../../lib/format.ts";
import {
  type BackupLayer,
  DATABASE_WARNING_BYTES,
  type OwnerStatus,
} from "../../lib/server-status.ts";
import { Row, Section } from "../settings/settings-rows.tsx";

/** The server's database, disk, and backup layers (docs/backups.md#visibility). */
export function ServerSection(props: {
  status: OwnerStatus | null;
  storage: UseQueryResult<BackupStorage | null>;
  now: number;
}) {
  const { t } = useTranslation();
  const { status, now } = props;
  if (!status) {
    return (
      <Section title={t("admin.server.title")}>
        <Row
          label={t("admin.server.status")}
          hint={t("admin.server.statusHint")}
        />
      </Section>
    );
  }
  const large = status.databaseBytes > DATABASE_WARNING_BYTES;
  return (
    <Section title={t("admin.server.title")}>
      <Row
        label={t("admin.server.database")}
        hint={large ? t("admin.server.databaseLarge") : undefined}
      >
        <Value warn={large}>{formatBytes(status.databaseBytes)}</Value>
      </Row>
      {status.freeDiskBytes !== null && (
        <Row label={t("admin.server.freeDisk")}>
          <Value>{formatBytes(status.freeDiskBytes)}</Value>
        </Row>
      )}
      <BackupRow
        label={t("admin.server.replica")}
        hint={t("admin.server.replicaHint")}
        layer={status.backups.litestream}
        now={now}
      />
      <BackupRow
        label={t("admin.server.dailyCopy")}
        hint={t("admin.server.dailyCopyHint")}
        layer={status.backups.dailyCopy}
        now={now}
      />
      <StorageRow storage={props.storage} />
    </Section>
  );
}

function StorageRow(props: { storage: UseQueryResult<BackupStorage | null> }) {
  const { t } = useTranslation();
  const { data, error } = props.storage;
  const groups = data?.groups
    .map((group) =>
      t("admin.server.storageGroup", {
        objects: group.objects,
        prefix: group.prefix || t("admin.server.otherGroup"),
        bytes: formatBytes(group.bytes),
      }),
    )
    .join(", ");
  return (
    <Row
      label={t("admin.server.backupStorage")}
      hint={
        <>
          {groups
            ? t("admin.server.storageHintGroups", { groups })
            : t("admin.server.storageHint")}
          {error && (
            <span className="block text-danger">
              {t("admin.server.listFailed", { error: error.message })}
            </span>
          )}
        </>
      }
    >
      <Value warn={error !== null}>
        {error
          ? t("admin.server.unknown")
          : data === undefined
            ? "…"
            : data === null
              ? t("admin.server.off")
              : formatBytes(data.bytes)}
      </Value>
    </Row>
  );
}

function BackupRow(props: {
  label: string;
  hint: string;
  layer: BackupLayer;
  now: number;
}) {
  const { t } = useTranslation();
  const { layer } = props;
  const value = !layer.configured
    ? t("admin.server.off")
    : layer.lastOkAt === null
      ? t("admin.server.never")
      : formatAgo(layer.lastOkAt, props.now);
  return (
    <Row
      label={props.label}
      hint={
        <>
          {props.hint}
          {layer.lastError && (
            <span className="block text-danger">
              {t("admin.server.lastRunFailed", { error: layer.lastError })}
            </span>
          )}
        </>
      }
    >
      <Value warn={layer.stale}>
        {layer.stale && layer.lastOkAt !== null
          ? t("admin.server.stale", { value })
          : value}
      </Value>
    </Row>
  );
}

function Value(props: { warn?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "tabular shrink-0 text-right font-medium",
        props.warn && "text-danger",
      )}
    >
      {props.children}
    </span>
  );
}
