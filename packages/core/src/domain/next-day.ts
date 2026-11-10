import { compareOrder, type Ordered } from "./position.ts";

export interface DayRef extends Ordered {
  deleted: boolean | 0 | 1;
}

/**
 * The day after the routine's last performed day, by position, wrapping
 * around the cycle. `days` includes deleted days: a deleted last day's old
 * position still locates the next existing day. With no last day, or one
 * that isn't in `days`, the cycle starts at its first day.
 */
export function nextDay(
  days: readonly DayRef[],
  lastDayId: string | null,
): string | null {
  const live = days.filter((d) => !d.deleted).sort(compareOrder);
  const last = days.find((d) => d.id === lastDayId);
  if (!last) return live[0]?.id ?? null;
  return (live.find((d) => compareOrder(d, last) > 0) ?? live[0])?.id ?? null;
}
