import { App } from "@capacitor/app";
import { useEffect, useSyncExternalStore } from "react";
import { useRunningSession } from "../features/session/running.ts";
import {
  isUpdateWaiting,
  subscribeUpdateWaiting,
  switchToWaitingBuild,
} from "../lib/live-update.ts";

/**
 * The Android app's counterpart of WebUpdate: switches to a downloaded web
 * build while the app is in the background and no session is running, so
 * the reload is never seen and never lands mid-workout. Android can keep
 * the app's process for days, so waiting for the next cold start would
 * leave the old build running that long.
 */
export function LiveUpdateSwitch() {
  const waiting = useSyncExternalStore(subscribeUpdateWaiting, isUpdateWaiting);
  const running = useRunningSession() !== null;

  useEffect(() => {
    if (!waiting || running) return;
    let switched = false;
    const switchNow = () => {
      if (switched) return;
      switched = true;
      void switchToWaitingBuild();
    };
    const switchIfHidden = () => {
      if (document.visibilityState === "hidden") switchNow();
    };
    switchIfHidden();
    document.addEventListener("visibilitychange", switchIfHidden);
    // The activity's own signal, in case the WebView doesn't report hidden.
    const pause = App.addListener("pause", switchNow);
    return () => {
      document.removeEventListener("visibilitychange", switchIfHidden);
      void pause.then((handle) => handle.remove());
    };
  }, [waiting, running]);

  return null;
}
