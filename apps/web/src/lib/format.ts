import {
  type ExerciseType,
  formatWeight,
  type SetValues,
  type WeightUnit,
} from "@workout-logger/core";

/** `1:05`, or `1:02:05` from an hour. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

// English units to match the UI text; the device locale would mix in e.g. Finnish "t".
const sessionLengthFormat = new Intl.DurationFormat("en", {
  style: "narrow",
  minutesDisplay: "always",
});

/** `1h 5m`, `42m`: a finished session's length, to the minute. */
export function formatSessionLength(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  return sessionLengthFormat.format({
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  });
}

export function formatKm(meters: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
    meters / 1000,
  );
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
        : `${reps} reps`;
    case "reps":
      return `${reps} reps`;
    case "time":
      return formatDuration(set.duration_s ?? 0);
    case "distance_time":
      return `${formatKm(set.distance_m ?? 0)} km in ${formatDuration(set.duration_s ?? 0)}`;
  }
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
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: tz,
  }).format(startedAt);
}

export function formatTime(at: number, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  }).format(at);
}

export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  weight_reps: "Weight and reps",
  bodyweight_reps: "Bodyweight reps, optional added weight",
  reps: "Reps only",
  time: "Time",
  distance_time: "Distance and time",
};

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
