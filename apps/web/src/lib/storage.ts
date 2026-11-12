import { useEffect, useSyncExternalStore } from "react";

/** null until checked, or if the browser doesn't say. */
let persisted: boolean | null = null;
const listeners = new Set<() => void>();

function setPersisted(value: boolean | null) {
  persisted = value;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function refreshPersistence(): Promise<void> {
  try {
    setPersisted((await navigator.storage?.persisted?.()) ?? null);
  } catch {
    setPersisted(null);
  }
}

/** Chrome grants or refuses silently; Firefox prompts. */
export async function requestPersistence(): Promise<boolean> {
  const granted = await navigator.storage.persist();
  setPersisted(granted);
  return granted;
}

/**
 * Asks the browser not to evict the database under storage pressure
 * (docs/architecture.md#storage-durability). Firefox prompts, so ask once
 * automatically per context; Settings can ask again. The installed app asks
 * again because installing is what Chrome's grant mostly depends on.
 * Runs at startup, so it also loads the state Settings shows.
 */
export async function requestPersistenceOnce(
  context: "browser" | "installed",
): Promise<void> {
  const key =
    context === "browser"
      ? "storage-persist-asked"
      : "storage-persist-asked-installed";
  await refreshPersistence();
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    if (persisted !== true) await requestPersistence();
  } catch {
    // Not supported or storage blocked; Settings shows the state.
  }
}

/**
 * Whether storage is persistent. Rechecked when the page becomes visible,
 * since the browser can grant it at any time.
 */
export function usePersistence(): boolean | null {
  useEffect(() => {
    const onVisible = () =>
      document.visibilityState === "visible" && void refreshPersistence();
    void refreshPersistence();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return useSyncExternalStore(subscribe, () => persisted);
}
