import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/button.tsx";
import { Confirm } from "../../components/sheet.tsx";
import { toasts } from "../../components/toasts.tsx";
import { useDb } from "../../db/react.tsx";
import {
  SNAPSHOT_FOLDER,
  saveSnapshot,
  useLastSnapshotAt,
} from "../../lib/device-snapshots.ts";
import { formatDateTime } from "../../lib/format.ts";
import { useInstall } from "../../lib/install.ts";
import { isNative } from "../../lib/platform.ts";
import { requestPersistence, usePersistence } from "../../lib/storage.ts";
import { AndroidAppRow } from "./android-app-row.tsx";
import { Row, Section } from "./settings-rows.tsx";

export function DataSection() {
  const { t } = useTranslation();
  const db = useDb();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importBytes, setImportBytes] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportSnapshot() {
    setBusy(true);
    try {
      const where = await saveSnapshot(await db.exportSnapshot());
      if (isNative) {
        toasts.add({
          title: t("settings.data.snapshotSaved"),
          description: where,
        });
      }
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

  async function runImport(mode: "merge" | "replace") {
    if (!importBytes) return;
    setBusy(true);
    try {
      // The toast's Undo lasts seconds; the file keeps the old data for good.
      // No file, no replace.
      if (mode === "replace" && !(await saveBeforeReplace())) return;
      const result = await db.importSnapshot(importBytes, mode);
      const { undoTx } = result;
      toasts.add({
        title: t("settings.data.imported"),
        description:
          mode === "merge"
            ? t("settings.data.importedMerge", { count: result.written })
            : t("settings.data.importedReplace", {
                written: result.written,
                deleted: result.deleted,
              }),
        ...(undoTx !== null && {
          actionProps: {
            children: t("common.undo"),
            onClick: async () => {
              if (!(await db.undo(undoTx))) {
                toasts.add({
                  title: t("settings.data.undoFailed"),
                  ...(mode === "replace" && {
                    description: t("settings.data.undoFailedHint"),
                  }),
                });
              }
            },
          },
        }),
      });
    } catch (error) {
      toasts.add({
        title: t("settings.data.importFailed"),
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setBusy(false);
      setImportBytes(null);
    }
  }

  async function saveBeforeReplace(): Promise<boolean> {
    try {
      const where = await saveSnapshot(await db.exportSnapshot());
      toasts.add({
        title: t("settings.data.savedFirst"),
        description: where,
      });
      return true;
    } catch (error) {
      toasts.add({
        title: t("settings.data.notReplaced"),
        description: t("settings.data.saveFirstFailed", {
          error: error instanceof Error ? error.message : String(error),
        }),
        type: "error",
      });
      return false;
    }
  }

  return (
    <Section title={t("settings.data.title")}>
      <Row
        label={t("settings.data.exportSnapshot")}
        hint={
          isNative
            ? t("settings.data.exportHintNative", { folder: SNAPSHOT_FOLDER })
            : t("settings.data.exportHintWeb")
        }
      >
        <Button disabled={busy} onClick={exportSnapshot}>
          {t("settings.data.export")}
        </Button>
      </Row>
      <Row
        label={t("settings.data.importSnapshot")}
        hint={t("settings.data.importHint")}
      >
        <Button disabled={busy} onClick={() => fileInput.current?.click()}>
          {t("settings.data.import")}
        </Button>
        <input
          ref={fileInput}
          type="file"
          // Capacitor turns extensions into MIME types through Android's
          // table, which has none for SQLite, so the picker would only allow
          // application/vnd.sqlite3: a type our exported files never get.
          // The import rejects files that aren't snapshots.
          {...(!isNative && {
            accept: ".sqlite3,.sqlite,.db,application/vnd.sqlite3",
          })}
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
          <AndroidAppRow />
          <InstallRow />
          <StorageRow />
        </>
      )}
      <Confirm
        open={importBytes !== null}
        onOpenChange={(open) => !open && setImportBytes(null)}
        title={t("settings.data.importSnapshot")}
        description={t("settings.data.importChoice")}
        actions={[
          {
            label: t("settings.data.merge"),
            onClick: () => runImport("merge"),
          },
          {
            label: t("settings.data.replaceEverything"),
            variant: "danger",
            onClick: () => runImport("replace"),
          },
        ]}
      />
    </Section>
  );
}

function AutoSnapshotRow() {
  const { t } = useTranslation();
  const last = useLastSnapshotAt();
  return (
    <Row
      label={t("settings.data.autoSnapshots")}
      hint={
        last === null
          ? t("settings.data.autoSnapshotsNone", { folder: SNAPSHOT_FOLDER })
          : t("settings.data.autoSnapshotsLast", {
              folder: SNAPSHOT_FOLDER,
              time: formatDateTime(last),
            })
      }
    />
  );
}

function InstallRow() {
  const { t } = useTranslation();
  const { state, install } = useInstall();
  if (state === "installed") return null;
  return (
    <Row
      label={t("settings.data.install")}
      hint={
        state === "available"
          ? t("settings.data.installHintAvailable")
          : t("settings.data.installHintManual")
      }
    >
      {state === "available" && (
        <Button variant="primary" onClick={() => void install()}>
          {t("settings.data.installButton")}
        </Button>
      )}
    </Row>
  );
}

function StorageRow() {
  const { t } = useTranslation();
  const persisted = usePersistence();
  return (
    <Row
      label={t("settings.data.storage")}
      hint={
        persisted === null
          ? t("settings.data.storageUnknown")
          : persisted
            ? t("settings.data.storageProtected")
            : t("settings.data.storageUnprotected")
      }
    >
      {persisted === false && (
        <Button
          onClick={async () => {
            if (!(await requestPersistence())) {
              toasts.add({
                title: t("settings.data.askBrowserDenied"),
                description: t("settings.data.askBrowserDeniedHint"),
              });
            }
          }}
        >
          {t("settings.data.askBrowser")}
        </Button>
      )}
    </Row>
  );
}
