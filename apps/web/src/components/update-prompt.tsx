import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect } from "react";
import { toasts } from "./toasts.tsx";

/**
 * Offers a waiting new version as a toast that stays until answered. It never
 * activates by itself, so a running session isn't reloaded under the user.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    if (!needRefresh) return;
    const id = toasts.add({
      title: "A new version is ready",
      timeout: 0,
      actionProps: {
        children: "Reload",
        onClick: () => void updateServiceWorker(true),
      },
    });
    return () => toasts.close(id);
  }, [needRefresh, updateServiceWorker]);
  return null;
}
