import { useEffect, useSyncExternalStore } from "react";
import { SERVER_URL } from "./server.ts";

export type SignInProvider = "google" | "github";

export const PROVIDER_NAMES: Record<SignInProvider, string> = {
  google: "Google",
  github: "GitHub",
};

// Remembered so the sign-in row shows the right buttons offline.
const CACHE_KEY = "sign-in-providers";
const DEFAULT: SignInProvider[] = ["google"];

let providers: SignInProvider[] = readCache() ?? DEFAULT;
// Stories have no server to ask.
let fixedForStory = false;
const listeners = new Set<() => void>();

function set(next: SignInProvider[]) {
  providers = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The server's sign-in providers (`signIn` in `/api/status`), refreshed on mount. */
export function useSignInProviders(): SignInProvider[] {
  useEffect(() => void refreshSignInProviders(), []);
  return useSyncExternalStore(subscribe, () => providers);
}

/** For stories: fixes the list, and the server is never asked. */
export function setSignInProvidersForStory(next: SignInProvider[]) {
  fixedForStory = true;
  set(next);
}

async function refreshSignInProviders(): Promise<void> {
  if (fixedForStory) return;
  try {
    const res = await fetch(`${SERVER_URL}/api/status`);
    if (!res.ok) return;
    const body = (await res.json()) as { signIn?: unknown };
    if (!Array.isArray(body.signIn)) return;
    const next = body.signIn.filter(isProvider);
    writeCache(next);
    if (next.join() !== providers.join()) set(next);
  } catch {
    // Offline: keep the last known list.
  }
}

function isProvider(value: unknown): value is SignInProvider {
  return value === "google" || value === "github";
}

function readCache(): SignInProvider[] | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "");
    return Array.isArray(parsed) ? parsed.filter(isProvider) : null;
  } catch {
    return null;
  }
}

function writeCache(value: SignInProvider[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Without storage the list is fetched again next time.
  }
}
