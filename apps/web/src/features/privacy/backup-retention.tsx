import { clsx } from "clsx";

// Must match the R2 lifecycle rules in deploy/r2/ and docs/accounts.md#privacy.
// Pre-migration copies (14 days) are left out: monthly copies outlast them.
const RETENTION = [
  ["Continuous backup", "after 3 days"],
  ["Daily backups", "after 7 days"],
  ["Monthly backups", "after 3 months"],
];

/** How long backups keep a deleted account's data. */
export function BackupRetention(props: { className?: string }) {
  return (
    <ul className={clsx("list-disc pl-5 text-ink-muted", props.className)}>
      {RETENTION.map(([what, when]) => (
        <li key={what}>
          {what}: {when}
        </li>
      ))}
    </ul>
  );
}
