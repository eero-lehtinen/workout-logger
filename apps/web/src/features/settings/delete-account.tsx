import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, dangerAlignClass } from "../../components/button.tsx";
import { Sheet } from "../../components/sheet.tsx";
import { toasts } from "../../components/toasts.tsx";
import { useDb } from "../../db/react.tsx";
import { type AccountUser, deleteAccount } from "../../lib/account.ts";
import { saveSnapshot } from "../../lib/device-snapshots.ts";
import { BackupRetention } from "../privacy/backup-retention.tsx";
import { Row } from "./settings-rows.tsx";

/** Deletes the account after the user types its email. Not for the owner. */
export function DeleteAccountRow(props: { user: AccountUser }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Row
      label={t("settings.deleteAccount.label")}
      hint={t("settings.deleteAccount.hint")}
    >
      <Button variant="danger" onClick={() => setOpen(true)}>
        {t("common.delete")}
      </Button>
      {open && (
        <DeleteAccountSheet user={props.user} onClose={() => setOpen(false)} />
      )}
    </Row>
  );
}

function DeleteAccountSheet(props: { user: AccountUser; onClose: () => void }) {
  const { t } = useTranslation();
  const db = useDb();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = email.trim().toLowerCase() === props.user.email.toLowerCase();

  async function exportFirst() {
    setBusy(true);
    try {
      const where = await saveSnapshot(await db.exportSnapshot());
      toasts.add({
        title: t("settings.data.snapshotSaved"),
        description: where,
      });
    } catch (error) {
      toasts.add({
        title: t("settings.data.exportFailed"),
        description: String(error),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteAccount(email);
      toasts.add({
        title: t("settings.deleteAccount.deleted"),
        description: t("settings.deleteAccount.deletedHint"),
      });
      props.onClose();
    } catch (error) {
      toasts.add({
        title: t("settings.deleteAccount.failed"),
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && props.onClose()}
      title={t("settings.deleteAccount.label")}
    >
      <div className="flex flex-col gap-4 px-4 py-4 text-[0.9375rem]">
        <p>{t("settings.deleteAccount.body")}</p>
        <div>
          <p>{t("settings.deleteAccount.backups")}</p>
          <BackupRetention className="mt-1" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-ink-muted">
            {t("settings.deleteAccount.keepCopy")}
          </p>
          <Button disabled={busy} onClick={exportFirst}>
            {t("settings.data.exportSnapshot")}
          </Button>
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-medium">
            {t("settings.deleteAccount.typeEmail", {
              email: props.user.email,
            })}
          </span>
          <input
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 rounded-xl bg-chalk px-3 outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink"
          />
        </label>
        <Button
          variant="danger"
          className={`self-start ${dangerAlignClass}`}
          disabled={!matches || busy}
          onClick={remove}
        >
          {t("settings.deleteAccount.label")}
        </Button>
      </div>
    </Sheet>
  );
}
