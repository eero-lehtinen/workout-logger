import { App } from "@capacitor/app";
import { i18n } from "../i18n/index.ts";
import { readToken } from "./auth-token.ts";
import { isNative } from "./platform.ts";

/** The Android app names the server; the web app is served by it. */
export const SERVER_URL: string = isNative
  ? (import.meta.env.VITE_SERVER_URL ?? "https://lift.eerolehtinen.fi")
  : "";

/** The error for a response the app can't use, with a text the user can read. */
export function serverAnswered(status: number): Error {
  return new Error(i18n.t("ui.errors.serverAnswered", { status }));
}

/**
 * Headers for an API call as the signed-in user. The Android app sends its
 * bearer token and version; the web app's session cookie goes by itself.
 */
export async function apiHeaders(): Promise<Record<string, string>> {
  if (!isNative) return {};
  const [token, { version }] = await Promise.all([readToken(), App.getInfo()]);
  return {
    "X-Client-Version": version,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
