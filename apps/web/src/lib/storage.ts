import { useEffect, useState } from "react";

const ASKED_KEY = "storage-persist-asked";

/**
 * Asks the browser not to evict the database under storage pressure
 * (docs/architecture.md#storage-durability). Firefox prompts, so ask once
 * automatically; Settings can ask again.
 */
export async function requestPersistenceOnce(): Promise<void> {
  try {
    if (localStorage.getItem(ASKED_KEY)) return;
    localStorage.setItem(ASKED_KEY, "1");
    if (!(await navigator.storage?.persisted?.()))
      await navigator.storage?.persist?.();
  } catch {
    // Not supported or storage blocked; Settings shows the state.
  }
}

/**
 * Whether storage is persistent; null if the browser doesn't say. Rechecked
 * when the page becomes visible, since installing the app can grant it.
 */
export function usePersistence() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    const check = () =>
      void navigator.storage
        ?.persisted?.()
        .then(setPersisted, () => setPersisted(null));
    const onVisible = () => document.visibilityState === "visible" && check();
    check();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return {
    persisted,
    /** Chrome grants or refuses silently; Firefox prompts. */
    request: async (): Promise<boolean> => {
      const granted = await navigator.storage.persist();
      setPersisted(granted);
      return granted;
    },
  };
}
