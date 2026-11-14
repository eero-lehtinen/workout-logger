import {
  addDays,
  type IsoDate,
  type WeekStart,
  weekOf,
} from "@workout-logger/core";

/**
 * The day a key moves the calendar's selection to from `date`, following the
 * WAI-ARIA date grid pattern, or null for keys it doesn't handle. Shift with
 * PageUp/PageDown moves by a year. A month move keeps the day of the month,
 * clamped to the target month's length.
 */
export function dayForKey(
  date: IsoDate,
  key: string,
  shift: boolean,
  weekStart: WeekStart,
): IsoDate | null {
  const months = (n: number) =>
    Temporal.PlainDate.from(date).add({ months: n }).toString();
  switch (key) {
    case "ArrowLeft":
      return addDays(date, -1);
    case "ArrowRight":
      return addDays(date, 1);
    case "ArrowUp":
      return addDays(date, -7);
    case "ArrowDown":
      return addDays(date, 7);
    case "PageUp":
      return months(shift ? -12 : -1);
    case "PageDown":
      return months(shift ? 12 : 1);
    case "Home":
      return weekOf(date, weekStart);
    case "End":
      return addDays(weekOf(date, weekStart), 6);
    default:
      return null;
  }
}
