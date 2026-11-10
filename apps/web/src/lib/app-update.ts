import { App } from "@capacitor/app";
import { compareVersions, validate } from "compare-versions";
import { isNative } from "./platform.ts";

/** The Android app names the server; the web app is served by it. */
const SERVER_URL: string = isNative
  ? (import.meta.env.VITE_SERVER_URL ?? "https://lift.eerolehtinen.fi")
  : "";

/**
 * The latest APK, for a link in a browser. The Android app itself uses
 * downloadUpdate.
 */
export const APK_URL = `${SERVER_URL}/api/android/apk`;

export interface AppUpdate {
  version: string;
}

/** The installed app's versionName, e.g. "1.2.3". */
export async function appVersion(): Promise<string> {
  return (await App.getInfo()).version;
}

/**
 * Whether `latest` should be offered to an app at `installed`. Local builds
 * are version 0.0.0 and never get an offer.
 */
export function isUpdate(installed: string, latest: string): boolean {
  if (!validate(installed) || !validate(latest)) return false;
  if (installed.startsWith("0.0.0")) return false;
  return compareVersions(latest, installed) > 0;
}

/**
 * Asks the server for the latest release (docs/deployment.md#android-releases).
 * Resolves to null when the app is up to date; rejects when the server can't
 * be reached.
 */
export async function checkForUpdate(): Promise<AppUpdate | null> {
  const [installed, version] = await Promise.all([
    appVersion(),
    latestRelease(),
  ]);
  return version && isUpdate(installed, version) ? { version } : null;
}

/** The version of the latest released APK, or null if there is none. */
export async function latestRelease(): Promise<string | null> {
  const res = await fetch(`${SERVER_URL}/api/android/latest`);
  // 404: no release has been published yet.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`The server answered ${res.status}`);
  return ((await res.json()) as { version: string }).version;
}

/**
 * Opens the latest APK in the system browser, which downloads it; Capacitor
 * hands links to other hosts to the browser. The link goes to GitHub, not to
 * the server: the browser may have the web app's service worker for the
 * server's origin, which would answer with the app instead of the file.
 * The URL is short-lived, so it is fetched when the download is asked for.
 */
export async function downloadUpdate(): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/android/download`);
  if (!res.ok) throw new Error(`The server answered ${res.status}`);
  const { url } = (await res.json()) as { url: string };
  window.open(url, "_blank");
}
