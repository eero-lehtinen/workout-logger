import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect, useState } from "react";
import { useRunningSession } from "../features/session/running.ts";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
// Switching back and forth between tabs shouldn't fetch sw.js every time.
const MIN_CHECK_GAP_MS = 60 * 1000;
const UNLOAD_GRACE_MS = 1000;

/**
 * Switches to a new version of the web app when doing so can't lose what is
 * on screen, such as a half-typed set or the in-page rest timer. Logged data
 * is already in the database either way.
 *
 * - A version that was already waiting when the app opened is applied at
 *   once, also during a session: nothing has been typed yet.
 * - One found later waits until the page is hidden and no session is
 *   running, so the reload is never seen and never lands mid-workout.
 *
 * The browser only looks for a new version on a page load, so the app also
 * looks when it comes back to the front and hourly while open.
 */
export function WebUpdate() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const [waitingAtStart, setWaitingAtStart] = useState(false);
  const {
    needRefresh: [waiting],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, r) {
      if (!r) return;
      setWaitingAtStart(r.waiting !== null);
      setRegistration(r);
    },
  });
  const running = useRunningSession() !== null;

  useEffect(() => {
    if (!waiting) return;
    if (waitingAtStart) {
      void updateServiceWorker(true);
      return;
    }
    if (running) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const switchIfHidden = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "hidden") return;
      // A reload hides the page too. Switching then races the reload, which
      // the old version already answered, so the new page would be the old
      // build. An unloaded page runs no timers; the new page then finds the
      // version waiting at start.
      timer = setTimeout(() => void updateServiceWorker(true), UNLOAD_GRACE_MS);
    };
    switchIfHidden();
    document.addEventListener("visibilitychange", switchIfHidden);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", switchIfHidden);
    };
  }, [waiting, waitingAtStart, running, updateServiceWorker]);

  useEffect(() => {
    if (registration) return watchForUpdates(registration);
  }, [registration]);

  return null;
}

function watchForUpdates(registration: ServiceWorkerRegistration) {
  // The page load itself made the browser check.
  let lastCheck = Date.now();
  const check = () => {
    if (Date.now() - lastCheck < MIN_CHECK_GAP_MS) return;
    if (registration.installing || !navigator.onLine) return;
    lastCheck = Date.now();
    // Rejects when offline or the server is down; the next check retries.
    registration.update().catch(() => {});
  };
  const checkIfVisible = () => {
    if (document.visibilityState === "visible") check();
  };
  const timer = setInterval(check, CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", checkIfVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", checkIfVisible);
  };
}
