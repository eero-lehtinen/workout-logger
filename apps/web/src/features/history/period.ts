import type { IsoDate } from "@workout-logger/core";
import { i18n } from "../../i18n/index.ts";
import { usePreference } from "../../lib/preference.ts";

/** How far back the history screens look, ending today. */
export type Period = "3m" | "6m" | "1y" | "all";

const PERIOD_VALUES = [
  "3m",
  "6m",
  "1y",
  "all",
] as const satisfies readonly Period[];

export function periodOptions(): { value: Period; label: string }[] {
  return PERIOD_VALUES.map((value) => ({
    value,
    label: i18n.t(`history.periods.${value}`),
  }));
}

/** "12 sessions in the last 3 months", or just "12 sessions" for all time. */
export function periodSessions(period: Period, count: number): string {
  return i18n.t(`history.periodSessions.${period}`, { count });
}

export function periodRecordsTitle(period: Period): string {
  return i18n.t(`history.periodRecords.${period}`);
}

/** The empty state of a period that has sessions elsewhere, so never "all". */
export function periodNoSets(period: Exclude<Period, "all">): string {
  return i18n.t(`history.periodNoSets.${period}`);
}

/** The period's first date, or null for all time. */
export function periodStart(period: Period, today: IsoDate): IsoDate | null {
  const t = Temporal.PlainDate.from(today);
  const back = { "3m": { months: 3 }, "6m": { months: 6 }, "1y": { years: 1 } };
  if (period === "all") return null;
  return t.subtract(back[period]).add({ days: 1 }).toString();
}

/** The period every history screen shows, remembered on this device. */
export function usePeriod() {
  return usePreference<Period>("history-period", PERIOD_VALUES, "all");
}
