import { clsx } from "clsx";
import { useTranslation } from "react-i18next";

/** How long backups keep a deleted account's data. */
export function BackupRetention(props: { className?: string }) {
  const { t } = useTranslation();
  // Must match the R2 lifecycle rules in deploy/r2/ and docs/accounts.md#privacy.
  // Pre-migration copies (14 days) are left out: monthly copies outlast them.
  // The continuous backup's 5 days is its bucket's rule; Litestream deletes
  // after 3, but R2 can leave its deletes undone.
  const retention = [
    t("privacy.retention.continuous", { count: 5 }),
    t("privacy.retention.daily", { count: 7 }),
    t("privacy.retention.monthly", { count: 3 }),
  ];
  return (
    <ul className={clsx("list-disc pl-5 text-ink-muted", props.className)}>
      {retention.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}
