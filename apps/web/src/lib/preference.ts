import { useSyncExternalStore } from "react";

/*
 * View preferences of this device, e.g. the history period: not synced, and
 * a missing value or blocked storage just means the default. Every view
 * using a key updates when it changes.
 */

const listeners = new Set<() => void>();
/** Used only where storage is blocked: remembered for this page load. */
const fallback = new Map<string, string>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function readPreference<T extends string>(
  key: string,
  allowed: readonly T[],
  initial: T,
): T {
  let value: string | null | undefined;
  try {
    value = localStorage.getItem(key);
  } catch {
    value = fallback.get(key);
  }
  return allowed.includes(value as T) ? (value as T) : initial;
}

export function usePreference<T extends string>(
  key: string,
  allowed: readonly T[],
  initial: T,
): [T, (value: T) => void] {
  const value = useSyncExternalStore(subscribe, () =>
    readPreference(key, allowed, initial),
  );
  const set = (next: T) => {
    try {
      localStorage.setItem(key, next);
    } catch {
      fallback.set(key, next);
    }
    for (const listener of listeners) listener();
  };
  return [value, set];
}

const SWITCH = ["on", "off"] as const;

/** An on/off view preference, e.g. whether a chart shows its trend line. */
export function useSwitchPreference(
  key: string,
  initial: boolean,
): [boolean, (on: boolean) => void] {
  const [value, set] = usePreference(key, SWITCH, initial ? "on" : "off");
  return [value === "on", (on) => set(on ? "on" : "off")];
}
