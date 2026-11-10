import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { isNative } from "./platform.ts";

// Android only. The bearer token lives in Keystore-backed storage, never in
// localStorage or other WebView storage (AGENTS.md invariant 12). The web app
// uses an httpOnly session cookie instead.
const KEY = "session-token";

export async function readToken(): Promise<string | null> {
  if (!isNative) return null;
  return SecureStorage.getItem(KEY);
}

export async function storeToken(token: string): Promise<void> {
  await SecureStorage.setItem(KEY, token);
}

export async function clearToken(): Promise<void> {
  if (isNative) await SecureStorage.removeItem(KEY);
}
