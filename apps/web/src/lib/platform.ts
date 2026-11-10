import { Capacitor } from "@capacitor/core";

/** Whether this is the Android app rather than a browser or the installed PWA. */
export const isNative = Capacitor.isNativePlatform();

/** A browser on an Android device, where the Android app could be installed. */
export function isAndroidBrowser(): boolean {
  return !isNative && /Android/i.test(navigator.userAgent);
}
