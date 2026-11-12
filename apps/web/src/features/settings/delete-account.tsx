import { useState } from "react";
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
  const [open, setOpen] = useState(false);
  return (
    <Row
      label="Delete account"
      hint="Removes your data from the server. This device keeps its copy."
    >
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete
      </Button>
      {open && (
        <DeleteAccountSheet user={props.user} onClose={() => setOpen(false)} />
      )}
    </Row>
  );
}

function DeleteAccountSheet(props: { user: AccountUser; onClose: () => void }) {
  const db = useDb();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = email.trim().toLowerCase() === props.user.email.toLowerCase();

  async function exportFirst() {
    setBusy(true);
    try {
      const where = await saveSnapshot(await db.exportSnapshot());
      toasts.add({ title: "Snapshot saved", description: where });
    } catch (error) {
      toasts.add({
        title: "Export failed",
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
        title: "Account deleted",
        description: "This device keeps its data and no longer syncs.",
      });
      props.onClose();
    } catch (error) {
      toasts.add({
        title: "The account wasn't deleted",
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
      title="Delete account"
    >
      <div className="flex flex-col gap-4 px-4 py-4 text-[0.9375rem]">
        <p>
          The server deletes your account and all your workout data right away.
          Your other devices stop syncing. This device keeps its data and signs
          out.
        </p>
        <div>
          <p>Older backups still contain your data until they are deleted:</p>
          <BackupRetention className="mt-1" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-ink-muted">Keep a copy of your data first.</p>
          <Button disabled={busy} onClick={exportFirst}>
            Export snapshot
          </Button>
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-medium">
            Type {props.user.email} to confirm
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
          Delete account
        </Button>
      </div>
    </Sheet>
  );
}
