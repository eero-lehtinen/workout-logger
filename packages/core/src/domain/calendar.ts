/** The first day of a week in the calendar and in weekly stats. */
export type WeekStart = "monday" | "sunday";

/** ISO `YYYY-MM-DD`. */
export type IsoDate = string;

/**
 * A session's calendar date: the local date of its start in the session's
 * own zone, so a session keeps its day when the device travels.
 */
export function localDate(at: number, tz: string): IsoDate {
  return Temporal.Instant.fromEpochMilliseconds(at)
    .toZonedDateTimeISO(tz)
    .toPlainDate()
    .toString();
}

/** The first date of the week that holds `date`. */
export function weekOf(date: IsoDate, weekStart: WeekStart): IsoDate {
  const day = Temporal.PlainDate.from(date);
  // dayOfWeek is ISO: Monday 1 .. Sunday 7.
  const offset = weekStart === "monday" ? day.dayOfWeek - 1 : day.dayOfWeek % 7;
  return day.subtract({ days: offset }).toString();
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}

/** Whole days from `a` to `b`; negative if `b` is earlier. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Temporal.PlainDate.from(a).until(b, { largestUnit: "days" }).days;
}

/** Every week start from the week of `from` through the week of `to`. */
export function weeksBetween(
  from: IsoDate,
  to: IsoDate,
  weekStart: WeekStart,
): IsoDate[] {
  const weeks: IsoDate[] = [];
  const last = weekOf(to, weekStart);
  for (let w = weekOf(from, weekStart); w <= last; w = addDays(w, 7)) {
    weeks.push(w);
  }
  return weeks;
}
