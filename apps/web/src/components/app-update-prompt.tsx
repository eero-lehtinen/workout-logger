import { useEffect } from "react";
import { checkForUpdate, downloadUpdate } from "../lib/app-update.ts";
import { toasts } from "./toasts.tsx";

/**
 * The Android app's counterpart of UpdatePrompt: on start, offers a newer
 * APK as a toast that stays until answered.
 */
export function AppUpdatePrompt() {
  useEffect(() => {
    let id: string | undefined;
    let cancelled = false;
    checkForUpdate().then(
      (update) => {
        if (!update || cancelled) return;
        id = toasts.add({
          title: `Version ${update.version} is available`,
          timeout: 0,
          actionProps: {
            children: "Download",
            onClick: () => downloadUpdate(update),
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
