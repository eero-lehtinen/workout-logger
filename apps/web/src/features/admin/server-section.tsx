import { clsx } from "clsx";
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
  now: number;
}) {
  const { status, now } = props;
  if (!status) {
    return (
      <Section title="Server">
        <Row label="Status" hint="Not loaded yet. It loads when online." />
      </Section>
    );
  }
  const large = status.databaseBytes > DATABASE_WARNING_BYTES;
  return (
    <Section title="Server">
      <Row
        label="Database"
        hint={
          large
            ? "Over 700 MB, about 4 GB of backups in R2. Lower quotas or the account cap, or remove accounts."
            : undefined
        }
      >
        <Value warn={large}>{formatBytes(status.databaseBytes)}</Value>
      </Row>
      {status.freeDiskBytes !== null && (
        <Row label="Free disk">
          <Value>{formatBytes(status.freeDiskBytes)}</Value>
        </Row>
      )}
      <BackupRow
        label="Replica"
        hint="Litestream, continuous. Stale after 1 hour."
        layer={status.backups.litestream}
        now={now}
      />
      <BackupRow
        label="Daily copy"
        hint="The whole database, once a day. Stale after 2 days."
        layer={status.backups.dailyCopy}
        now={now}
      />
    </Section>
  );
}

function BackupRow(props: {
  label: string;
  hint: string;
  layer: BackupLayer;
  now: number;
}) {
  const { layer } = props;
  const value = !layer.configured
    ? "Off"
    : layer.lastOkAt === null
      ? "Never"
      : formatAgo(layer.lastOkAt, props.now);
  return (
    <Row
      label={props.label}
      hint={
        <>
          {props.hint}
          {layer.lastError && (
            <span className="block text-danger">
              Last run failed: {layer.lastError}
            </span>
          )}
        </>
      }
    >
      <Value warn={layer.stale}>
        {layer.stale && layer.lastOkAt !== null ? `Stale · ${value}` : value}
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
