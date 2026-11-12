import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { createAuthClient } from "better-auth/client";
import { useSyncExternalStore } from "react";
import { toasts } from "../components/toasts.tsx";
import { i18n } from "../i18n/index.ts";
import { clearToken, readToken, storeToken } from "./auth-token.ts";
import { isNative } from "./platform.ts";
import { apiHeaders, SERVER_URL, serverAnswered } from "./server.ts";
import type { SignInProvider } from "./sign-in-providers.ts";

export interface AccountUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: "owner" | "user";
}

/**
 * `unknown` until the first check. `offline` keeps the last known user, so
 * the account shows and sync retries while the server can't be reached.
 */
export type AccountState =
  | { status: "unknown" }
  | { status: "signed-out"; expired: boolean }
  | { status: "signed-in"; user: AccountUser; offline: boolean };

// The user's name and id, not a secret: the session itself is the cookie or
// the token in secure storage.
const CACHE_KEY = "account-user";

let state: AccountState = { status: "unknown" };
const listeners = new Set<() => void>();

function set(next: AccountState) {
  state = next;
  if (next.status === "signed-in") writeCache(next.user);
  if (next.status === "signed-out") writeCache(null);
  for (const listener of listeners) listener();
}

export function getAccount(): AccountState {
  return state;
}

export function subscribeAccount(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAccount(): AccountState {
  return useSyncExternalStore(subscribeAccount, getAccount);
}

/** For stories: shows the screens as a given account sees them. */
export function setAccountForStory(next: AccountState) {
  state = next;
  for (const listener of listeners) listener();
}

/** Asks the server who is signed in. */
export async function refreshAccount(): Promise<void> {
  if (isNative && !(await readToken())) {
    set({ status: "signed-out", expired: false });
    return;
  }
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}/api/me`, { headers: await apiHeaders() });
  } catch {
    const cached = readCache();
    set(
      cached
        ? { status: "signed-in", user: cached, offline: true }
        : { status: "signed-out", expired: false },
    );
    return;
  }
  if (res.status === 401) {
    await sessionEnded();
    return;
  }
  if (!res.ok) return;
  set({
    status: "signed-in",
    user: (await res.json()) as AccountUser,
    offline: false,
  });
}

/** The server no longer accepts the session, e.g. it was revoked. */
export async function sessionEnded(): Promise<void> {
  const wasSignedIn = state.status === "signed-in" || readCache() !== null;
  await clearToken();
  set({ status: "signed-out", expired: wasSignedIn });
}

const authClient = createAuthClient({ basePath: "/api/auth" });

/**
 * Web: a redirect through the provider and back to Settings. Android: the
 * provider in a Custom Tab, which returns through the app's deep link
 * (`appUrlOpen`).
 */
export async function signIn(provider: SignInProvider): Promise<void> {
  if (!isNative) {
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: "/settings",
      newUserCallbackURL: "/settings?welcome=1",
      errorCallbackURL: "/settings",
    });
    if (error) {
      throw new Error(error.message ?? i18n.t("ui.account.signInFailed"));
    }
    return;
  }
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  pendingVerifier = verifier;
  const challenge = base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );
  const { id } = await App.getInfo();
  const query = new URLSearchParams({ app: id, challenge, provider });
  await Browser.open({
    url: `${SERVER_URL}/api/native-auth/start?${query}`,
  });
}

/** Ends the session on the server. Local data stays, unsynced. */
export async function signOut(): Promise<void> {
  try {
    if (isNative) {
      await fetch(`${SERVER_URL}/api/native-auth/sign-out`, {
        method: "POST",
        headers: await apiHeaders(),
      });
    } else {
      await authClient.signOut();
    }
  } finally {
    await clearToken();
    set({ status: "signed-out", expired: false });
  }
}

/**
 * Deletes the account on the server and signs this device out. The device
 * keeps its data, still bound to the deleted account, so a later sign-in
 * asks to merge or discard (docs/accounts.md#privacy).
 */
export async function deleteAccount(email: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/me`, {
    method: "DELETE",
    headers: { ...(await apiHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw serverAnswered(res.status);
  await clearToken();
  set({ status: "signed-out", expired: false });
}

// Kept in memory only: if Android kills the app while the Custom Tab is
// open, the code can't be redeemed and the user signs in again.
let pendingVerifier: string | null = null;

/** Wires up the sign-in return paths and checks the session. Once, at startup. */
export function initAccount(): void {
  const cached = readCache();
  if (cached) state = { status: "signed-in", user: cached, offline: true };
  if (isNative) {
    void App.addListener("appUrlOpen", ({ url }) => {
      void finishNativeSignIn(url);
    });
  } else {
    reportWebSignInReturn();
  }
  void refreshAccount();
}

async function finishNativeSignIn(url: string) {
  const link = new URL(url);
  if (link.host !== "auth") return;
  void Browser.close().catch(() => {});
  const code = link.searchParams.get("code");
  const verifier = pendingVerifier;
  pendingVerifier = null;
  if (!code || !verifier) {
    signInFailed(
      link.searchParams.get("error") ?? i18n.t("ui.account.signInUnfinished"),
    );
    return;
  }
  try {
    const res = await fetch(`${SERVER_URL}/api/native-auth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, verifier }),
    });
    if (!res.ok) throw serverAnswered(res.status);
    await storeToken(((await res.json()) as { token: string }).token);
    await refreshAccount();
    if (link.searchParams.has("welcome")) welcome();
  } catch (error) {
    signInFailed(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Better Auth sends a failed web sign-in back with `?error=`, and a sign-up
 * with `?welcome=1` (`newUserCallbackURL`).
 */
function reportWebSignInReturn() {
  const params = new URLSearchParams(location.search);
  const error = params.get("error");
  const isWelcome = params.has("welcome");
  if (!error && !isWelcome) return;
  params.delete("error");
  params.delete("welcome");
  params.delete("error_description");
  const search = params.size > 0 ? `?${params}` : "";
  history.replaceState(history.state, "", `${location.pathname}${search}`);
  if (error) signInFailed(error);
  else welcome();
}

function welcome() {
  toasts.add({
    title: i18n.t("ui.account.welcomeTitle"),
    description: i18n.t("ui.account.welcomeText"),
  });
}

function signInErrorText(reason: string): string {
  switch (reason) {
    case "signup_closed":
      return i18n.t("ui.account.signupClosed");
    case "account_disabled":
      return i18n.t("ui.account.accountDisabled");
    default:
      return reason.replaceAll("_", " ");
  }
}

function signInFailed(reason: string) {
  toasts.add({
    title: i18n.t("ui.account.signInFailed"),
    description: signInErrorText(reason),
    type: "error",
  });
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function readCache(): AccountUser | null {
  try {
    const text = localStorage.getItem(CACHE_KEY);
    return text ? (JSON.parse(text) as AccountUser) : null;
  } catch {
    return null;
  }
}

function writeCache(user: AccountUser | null) {
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // Without storage the account shows once the server answers.
  }
}
