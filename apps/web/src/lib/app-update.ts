import { App } from "@capacitor/app";
import { compareVersions, validate } from "compare-versions";

/** The server the Android app talks to; the web app is served by it. */
const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ?? "https://lift.eerolehtinen.fi";

export interface AppUpdate {
  version: string;
  /** Opens in the browser, which downloads the APK. */
  url: string;
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
  const installed = await appVersion();
  const res = await fetch(`${SERVER_URL}/api/android/latest`);
  // 404: no release has been published yet.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`The server answered ${res.status}`);
  const { version } = (await res.json()) as { version: string };
  if (!isUpdate(installed, version)) return null;
  return { version, url: `${SERVER_URL}/api/android/apk` };
}

/** Capacitor hands links to other hosts to the system browser. */
export function downloadUpdate(update: AppUpdate) {
  window.open(update.url, "_blank");
}
