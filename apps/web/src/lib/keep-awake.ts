import { KeepAwake } from "@capacitor-community/keep-awake";
import { useEffect } from "react";
import { isNative } from "./platform.ts";

/**
 * Whether the screen can be kept on: always on Android; in browsers with
 * the Screen Wake Lock API, which the plugin uses on the web.
 */
export const keepAwakeSupported =
  isNative || (typeof navigator !== "undefined" && "wakeLock" in navigator);

/** Keeps the screen on while `active`. */
export function useKeepAwake(active: boolean) {
  useEffect(() => {
    if (!active || !keepAwakeSupported) return;
    // Browsers refuse the lock e.g. in battery saver; the screen then
    // sleeps as usual.
    KeepAwake.keepAwake().catch(() => {});
    return () => {
      KeepAwake.allowSleep().catch(() => {});
    };
  }, [active]);
}
