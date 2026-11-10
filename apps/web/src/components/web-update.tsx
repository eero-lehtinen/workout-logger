import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect } from "react";
import { useRunningSession } from "../features/session/running.ts";

/**
 * Switches to a waiting new version of the web app while the page is hidden
 * and no session is running, so the reload is never seen and never lands
 * mid-workout. Logged data is already in the database; a reload would only
 * lose what is on screen, such as a half-typed set or the in-page rest timer.
 */
export function WebUpdate() {
  const {
    needRefresh: [waiting],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });
  const running = useRunningSession() !== null;

  useEffect(() => {
    if (!waiting || running) return;
    const switchIfHidden = () => {
      if (document.visibilityState === "hidden") void updateServiceWorker(true);
    };
    switchIfHidden();
    document.addEventListener("visibilitychange", switchIfHidden);
    return () =>
      document.removeEventListener("visibilitychange", switchIfHidden);
  }, [waiting, running, updateServiceWorker]);

  return null;
}
