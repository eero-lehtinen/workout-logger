import { App } from "@capacitor/app";
import { readToken } from "./auth-token.ts";
import { isNative } from "./platform.ts";

/** The Android app names the server; the web app is served by it. */
export const SERVER_URL: string = isNative
  ? (import.meta.env.VITE_SERVER_URL ?? "https://lift.eerolehtinen.fi")
  : "";

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
