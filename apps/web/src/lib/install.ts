import { useSyncExternalStore } from "react";
import { requestPersistence } from "./storage.ts";

/** Chromium only, so not in TypeScript's DOM types. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

/**
 * `available`: the browser lets the app show its install prompt.
 * `manual`: it doesn't (Safari, Firefox, or Chrome before its install
 * criteria are met), so the user installs from the browser's menu.
 */
export type InstallState = "installed" | "available" | "manual";

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let watching = false;
const listeners = new Set<() => void>();

function changed() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getState(): InstallState {
  if (installed) return "installed";
  return deferred ? "available" : "manual";
}

/** Whether this page runs as the installed app rather than in a tab. */
export function runningInstalled(): boolean {
  return (
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/**
 * Chrome fires `beforeinstallprompt` once, soon after load, so this must run
 * before the first render, not when Settings opens.
 */
export function watchInstall(): void {
  if (watching) return;
  watching = true;
  installed = runningInstalled();
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keeps Chrome's own install banner away; Settings offers the prompt.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    changed();
  });
  // Fires for installs from the browser's menu too, not only from ours.
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    changed();
    requestPersistence().catch(() => {});
  });
}

/**
 * Shows the browser's install prompt and resolves whether the user accepted.
 * An event can prompt only once; Chrome fires a new one after a dismissal.
 */
async function install(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  try {
    await event.prompt();
    return (await event.userChoice).outcome === "accepted";
  } finally {
    if (deferred === event) deferred = null;
    changed();
  }
}

export function useInstall() {
  return { state: useSyncExternalStore(subscribe, getState), install };
}
