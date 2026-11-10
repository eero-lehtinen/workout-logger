import type { IsoDate } from "@workout-logger/core";
import { usePreference } from "../../lib/preference.ts";

/** How far back the history screens look, ending today. */
export type Period = "3m" | "6m" | "1y" | "all";

export const PERIODS = [
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "1y", label: "Year" },
  { value: "all", label: "All" },
] as const satisfies readonly { value: Period; label: string }[];

/** Completes "Records …", "12 sessions …". */
export const PERIOD_PHRASES: Record<Period, string> = {
  "3m": "in the last 3 months",
  "6m": "in the last 6 months",
  "1y": "in the last year",
  all: "",
};

/** The period's first date, or null for all time. */
export function periodStart(period: Period, today: IsoDate): IsoDate | null {
  const t = Temporal.PlainDate.from(today);
  const back = { "3m": { months: 3 }, "6m": { months: 6 }, "1y": { years: 1 } };
  if (period === "all") return null;
  return t.subtract(back[period]).add({ days: 1 }).toString();
}

/** The period every history screen shows, remembered on this device. */
export function usePeriod() {
  return usePreference<Period>(
    "history-period",
    PERIODS.map((p) => p.value),
    "all",
  );
}
