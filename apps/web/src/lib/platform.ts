import { Capacitor } from "@capacitor/core";

/** Whether this is the Android app rather than a browser or the installed PWA. */
export const isNative = Capacitor.isNativePlatform();
