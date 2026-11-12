import {
  type ExerciseType,
  formatWeight as formatWeightIn,
  type SetValues,
  type WeightUnit,
} from "@workout-logger/core";
import { formatLocale, i18n } from "../i18n/index.ts";

/*
 * Dates and numbers follow the UI language (`formatLocale`), never the
 * device locale alone: a Finnish phone with the English UI would mix in
 * Finnish month names and units. Formatters are cached per locale and
 * options, so call these in render instead of keeping a module-level
 * formatter, which would keep the language it was made in.
 */

const formats = new Map<string, unknown>();

function cached<T>(kind: string, options: object, make: (l: string) => T): T {
  const locale = formatLocale();
  const key = `${kind}|${locale}|${JSON.stringify(options)}`;
  let format = formats.get(key) as T | undefined;
  if (format === undefined) {
    format = make(locale);
    formats.set(key, format);
  }
  return format;
}

export function dateFormat(
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return cached(
    "date",
    options,
    (locale) => new Intl.DateTimeFormat(locale, options),
  );
}

export function numberFormat(
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  return cached(
    "number",
    options,
    (locale) => new Intl.NumberFormat(locale, options),
  );
}

/** `1:05`, or `1:02:05` from an hour. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** `1h 5m`, `42m` (`1t 5min` in Finnish): a finished session's length, to the minute. */
export function formatSessionLength(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const options = { style: "narrow", minutesDisplay: "always" } as const;
  return cached(
    "duration",
    options,
    (locale) => new Intl.DurationFormat(locale, options),
  ).format({ hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

/** A weight in the display unit, with the UI language's decimal separator. */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return formatWeightIn(kg, unit, formatLocale());
}

export function formatKm(meters: number): string {
  return numberFormat({ maximumFractionDigits: 2 }).format(meters / 1000);
}

/** A set as it reads in a list, e.g. `100 × 8`, `+10 × 6`, `1:30`. */
export function formatSet(
  set: SetValues,
  type: ExerciseType,
  unit: WeightUnit,
): string {
  const reps = set.reps ?? 0;
  const weight = set.weight_kg ?? 0;
  switch (type) {
    case "weight_reps":
      return `${formatWeight(weight, unit)} × ${reps}`;
    case "bodyweight_reps":
      return weight > 0
        ? `+${formatWeight(weight, unit)} × ${reps}`
        : i18n.t("format.reps", { count: reps });
    case "reps":
      return i18n.t("format.reps", { count: reps });
    case "time":
      return formatDuration(set.duration_s ?? 0);
    case "distance_time":
      return i18n.t("format.distanceTime", {
        distance: formatKm(set.distance_m ?? 0),
        duration: formatDuration(set.duration_s ?? 0),
      });
  }
}

/** `102.5 kg` */
export function formatWeightWithUnit(kg: number, unit: WeightUnit): string {
  return `${formatWeight(kg, unit)} ${unit}`;
}

/** The unit shown after a set, if one applies. */
export function setUnit(type: ExerciseType, unit: WeightUnit): string | null {
  return type === "weight_reps"
    ? unit
    : type === "bodyweight_reps"
      ? unit
      : null;
}

/** `Mon 5 Jan`, or with the year when it isn't this year, in the session's zone. */
export function formatSessionDate(startedAt: number, tz: string): string {
  const sameYear =
    new Date(startedAt).getFullYear() === new Date().getFullYear();
  return dateFormat({
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: tz,
  }).format(startedAt);
}

export function formatTime(at: number, tz: string): string {
  return dateFormat({
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  }).format(at);
}

/** `5 Jan, 14:05` in the device's zone. */
export function formatDateTime(at: number): string {
  return dateFormat({
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

/** "just now", "5 minutes ago", "3 days ago". */
export function formatAgo(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return i18n.t("format.justNow");
  const options = { numeric: "auto" } as const;
  const format = cached(
    "relative",
    options,
    (locale) => new Intl.RelativeTimeFormat(locale, options),
  );
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return format.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return format.format(-hours, "hour");
  return format.format(-Math.floor(hours / 24), "day");
}

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

/** `850 B`, `12 kB`, `4.2 MB`, `21 GB`; binary multiples, as the server's quotas. */
export function formatBytes(bytes: number): string {
  // Intl's short byte unit reads "byte", not "B".
  if (bytes < KB) return i18n.t("format.bytes", { count: bytes });
  const [value, unit] =
    bytes >= GB
      ? [bytes / GB, "gigabyte"]
      : bytes >= MB
        ? [bytes / MB, "megabyte"]
        : [bytes / KB, "kilobyte"];
  return numberFormat({
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}

export const EXERCISE_TYPES = [
  "weight_reps",
  "bodyweight_reps",
  "reps",
  "time",
  "distance_time",
] as const satisfies readonly ExerciseType[];

export function exerciseTypeLabel(type: ExerciseType): string {
  return i18n.t(`format.exerciseTypes.${type}`);
}

/**
 * UTC midnight of an ISO date, as epoch ms. Format it with
 * `timeZone: "UTC"` to show the date itself.
 */
export function dateFromIso(date: string): number {
  return Temporal.PlainDate.from(date).toZonedDateTime("UTC").epochMilliseconds;
}

/** Today's date in the device's zone. */
export function todayIso(): string {
  return Temporal.Now.plainDateISO().toString();
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
