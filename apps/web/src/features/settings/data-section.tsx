import { useRef, useState } from "react";
import { Button } from "../../components/button.tsx";
import { Confirm } from "../../components/sheet.tsx";
import { toasts } from "../../components/toasts.tsx";
import { useDb } from "../../db/react.tsx";
import {
  SNAPSHOT_FOLDER,
  useLastSnapshotAt,
  writeDeviceSnapshot,
} from "../../lib/device-snapshots.ts";
import { formatDateTime } from "../../lib/format.ts";
import { useInstall } from "../../lib/install.ts";
import { isNative } from "../../lib/platform.ts";
import { requestPersistence, usePersistence } from "../../lib/storage.ts";
import { Row, Section } from "./settings-rows.tsx";

export function DataSection() {
  const db = useDb();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importBytes, setImportBytes] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportSnapshot() {
    setBusy(true);
    try {
      const bytes = await db.exportSnapshot();
      if (isNative) {
        // A WebView can't download; the file goes next to the automatic ones.
        const path = await writeDeviceSnapshot(bytes);
        toasts.add({ title: "Snapshot saved", description: path });
        return;
      }
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: "application/vnd.sqlite3" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `workout-logger-${date}.sqlite3`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
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

  async function runImport(mode: "merge" | "replace") {
    if (!importBytes) return;
    setBusy(true);
    try {
      const result = await db.importSnapshot(importBytes, mode);
      const { undoTx } = result;
      toasts.add({
        title: "Snapshot imported",
        description:
          mode === "merge"
            ? `${result.written} rows were newer than yours.`
            : `${result.written} rows written, ${result.deleted} removed.`,
        ...(undoTx !== null && {
          actionProps: {
            children: "Undo",
            onClick: () => void db.undo(undoTx),
          },
        }),
      });
    } catch (error) {
      toasts.add({
        title: "Import failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setBusy(false);
      setImportBytes(null);
    }
  }

  return (
    <Section title="Data">
      <Row
        label="Export snapshot"
        hint={
          isNative
            ? `Saves all your data as one file in Documents/${SNAPSHOT_FOLDER}.`
            : "Downloads all your data as one file. Keep it somewhere safe."
        }
      >
        <Button disabled={busy} onClick={exportSnapshot}>
          Export
        </Button>
      </Row>
      <Row label="Import snapshot" hint="From a file exported here.">
        <Button disabled={busy} onClick={() => fileInput.current?.click()}>
          Import
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".sqlite3,.sqlite,.db,application/vnd.sqlite3"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) setImportBytes(new Uint8Array(await file.arrayBuffer()));
          }}
        />
      </Row>
      {isNative ? (
        <AutoSnapshotRow />
      ) : (
        <>
          <InstallRow />
          <StorageRow />
        </>
      )}
      <Confirm
        open={importBytes !== null}
        onOpenChange={(open) => !open && setImportBytes(null)}
        title="Import snapshot"
        description="Merge keeps the newer version of anything in both. Replace makes your data match the file exactly; you can undo it right after."
        actions={[
          { label: "Merge", onClick: () => runImport("merge") },
          {
            label: "Replace everything",
            variant: "danger",
            onClick: () => runImport("replace"),
          },
        ]}
      />
    </Section>
  );
}

function AutoSnapshotRow() {
  const last = useLastSnapshotAt();
  return (
    <Row
      label="Automatic snapshots"
      hint={`Saved to Documents/${SNAPSHOT_FOLDER} after each session; the newest 10 are kept. ${
        last === null ? "None saved yet." : `Last: ${formatDateTime(last)}.`
      }`}
    />
  );
}

function InstallRow() {
  const { state, install } = useInstall();
  if (state === "installed") return null;
  return (
    <Row
      label="Install app"
      hint={
        state === "available"
          ? "Opens from your home screen or desktop, works offline, and keeps the browser from clearing your data."
          : "Install from your browser's menu. On iPhone: Share, then Add to Home Screen."
      }
    >
      {state === "available" && (
        <Button variant="primary" onClick={() => void install()}>
          Install
        </Button>
      )}
    </Row>
  );
}

function StorageRow() {
  const persisted = usePersistence();
  return (
    <Row
      label="Storage"
      hint={
        persisted === null
          ? "This browser doesn't report whether your data is protected from cleanup."
          : persisted
            ? "Protected: the browser won't clear your data to free space."
            : "Not protected: the browser may clear your data when space runs low. Installing the app usually protects it. Until then, export regularly."
      }
    >
      {persisted === false && (
        <Button
          onClick={async () => {
            if (!(await requestPersistence())) {
              toasts.add({
                title: "The browser didn't allow it",
                description:
                  "Chrome decides on its own, mostly once the app is installed. The app asks again when you install it.",
              });
            }
          }}
        >
          Ask browser
        </Button>
      )}
    </Row>
  );
}
