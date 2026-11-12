import { useEffect } from "react";
import { i18n } from "../i18n/index.ts";
import { checkForUpdate, downloadUpdate } from "../lib/app-update.ts";
import { toasts } from "./toasts.tsx";

/**
 * The Android app's counterpart of WebUpdate: on start, offers a newer APK
 * as a toast that stays until answered, since installing needs the user.
 */
export function AppUpdatePrompt() {
  useEffect(() => {
    let id: string | undefined;
    let cancelled = false;
    checkForUpdate().then(
      (update) => {
        if (!update || cancelled) return;
        id = toasts.add({
          title: i18n.t("ui.appUpdate.available", { version: update.version }),
          timeout: 0,
          actionProps: {
            children: i18n.t("ui.appUpdate.download"),
            onClick: () => void downloadUpdate().catch(reportDownloadFailure),
          },
        });
      },
      // Offline, most likely. Settings can check again.
      () => {},
    );
    return () => {
      cancelled = true;
      if (id) toasts.close(id);
    };
  }, []);
  return null;
}

export function reportDownloadFailure(error: unknown) {
  toasts.add({
    title: i18n.t("ui.appUpdate.downloadFailed"),
    description: error instanceof Error ? error.message : String(error),
    type: "error",
  });
}
