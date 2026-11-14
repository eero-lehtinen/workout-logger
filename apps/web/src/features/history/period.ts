import { type IsoDate, latestReset } from "@workout-logger/core";
import { useDbQuery } from "../../db/react.tsx";
import { i18n } from "../../i18n/index.ts";
import { dateFormat, dateFromIso } from "../../lib/format.ts";
import { usePreference } from "../../lib/preference.ts";

/**
 * How far back the history screens look, ending today. `reset` starts at the
 * latest record reset and is offered only when there is one.
 */
export type PeriodValue = "3m" | "6m" | "1y" | "all" | "reset";

export interface Period {
  value: PeriodValue;
  /** The latest record reset; null without one. */
  since: IsoDate | null;
}

const FIXED_VALUES = [
  "3m",
  "6m",
  "1y",
  "all",
] as const satisfies readonly PeriodValue[];

export function periodOptions(
  since: IsoDate | null,
): { value: PeriodValue; label: string }[] {
  const fixed = FIXED_VALUES.map((value) => ({
    value,
    label: i18n.t(`history.periods.${value}`),
  }));
  if (!since) return fixed;
  return [...fixed, { value: "reset", label: i18n.t("history.periods.reset") }];
}

/** "12 sessions in the last 3 months", or just "12 sessions" for all time. */
export function periodSessions(period: Period, count: number): string {
  return i18n.t(`history.periodSessions.${period.value}`, {
    count,
    date: sinceLabel(period.since),
  });
}

export function periodRecordsTitle(period: Period): string {
  return i18n.t(`history.periodRecords.${period.value}`, {
    date: sinceLabel(period.since),
  });
}

/** The empty state of a period that has sessions elsewhere, so never "all". */
export function periodNoSets(
  period: Period & { value: Exclude<PeriodValue, "all"> },
): string {
  return i18n.t(`history.periodNoSets.${period.value}`, {
    date: sinceLabel(period.since),
  });
}

/** The period's first date, or null for all time. */
export function periodStart(period: Period, today: IsoDate): IsoDate | null {
  if (period.value === "all") return null;
  if (period.value === "reset") return period.since;
  const t = Temporal.PlainDate.from(today);
  const back = { "3m": { months: 3 }, "6m": { months: 6 }, "1y": { years: 1 } };
  return t.subtract(back[period.value]).add({ days: 1 }).toString();
}

/**
 * The period every history screen shows, remembered on this device. With a
 * record reset it defaults to the time since it.
 */
export function usePeriod(): [Period, (value: PeriodValue) => void] {
  const settings = useDbQuery("settings");
  const since = latestReset(settings.record_resets);
  const [value, setValue] = usePreference<PeriodValue>(
    "history-period",
    since ? [...FIXED_VALUES, "reset"] : FIXED_VALUES,
    since ? "reset" : "all",
  );
  return [{ value, since }, setValue];
}

/** Day and month; the year too when it isn't this year. */
function sinceLabel(since: IsoDate | null): string {
  if (!since) return "";
  const thisYear =
    Temporal.PlainDate.from(since).year === Temporal.Now.plainDateISO().year;
  return dateFormat({
    day: "numeric",
    month: "short",
    ...(!thisYear && { year: "numeric" }),
    timeZone: "UTC",
  }).format(dateFromIso(since));
}
