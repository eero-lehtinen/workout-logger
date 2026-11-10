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

export function usePersistence() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    void navigator.storage
      ?.persisted?.()
      .then(setPersisted, () => setPersisted(null));
  }, []);
  return {
    persisted,
    request: async () => setPersisted(await navigator.storage.persist()),
  };
}
