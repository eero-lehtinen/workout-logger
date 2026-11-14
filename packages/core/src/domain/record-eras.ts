import type { IsoDate } from "./calendar.ts";

/**
 * Record resets split history into eras, so strength lost to a cut or a
 * break doesn't hide new records for months. A reset starts its era on its
 * date: a session on that date belongs to the new era. Rules in
 * docs/features.md#record-resets.
 */
export function recordEra(date: IsoDate, resets: readonly IsoDate[]): number {
  return resets.filter((reset) => reset <= date).length;
}

/** The first date of the latest era; null without resets. */
export function latestReset(resets: readonly IsoDate[]): IsoDate | null {
  let latest: IsoDate | null = null;
  for (const reset of resets) if (!latest || reset > latest) latest = reset;
  return latest;
}

/** Adds a reset; resets stay oldest first and unique. */
export function addReset(resets: readonly IsoDate[], date: IsoDate): IsoDate[] {
  return normalizeResets([...resets, date]);
}

export function removeReset(
  resets: readonly IsoDate[],
  date: IsoDate,
): IsoDate[] {
  return resets.filter((reset) => reset !== date);
}

export function normalizeResets(resets: readonly IsoDate[]): IsoDate[] {
  return [...new Set(resets)].sort();
}
