// Literal class names, so Tailwind finds them.
const DOT = [
  "bg-day-1",
  "bg-day-2",
  "bg-day-3",
  "bg-day-4",
  "bg-day-5",
  "bg-day-6",
] as const;

const CHIP = [
  "bg-day-1/15 border-day-1",
  "bg-day-2/15 border-day-2",
  "bg-day-3/15 border-day-3",
  "bg-day-4/15 border-day-4",
  "bg-day-5/15 border-day-5",
  "bg-day-6/15 border-day-6",
] as const;

/**
 * A workout day's color by its index in the cycle. Cycles longer than the
 * palette repeat colors; ad hoc sessions and deleted days are neutral.
 */
export function dayDotClass(dayIndex: number | null): string {
  return dayIndex === null
    ? "bg-ink-muted/50"
    : (DOT[dayIndex % DOT.length] ?? "");
}

export function dayChipClass(dayIndex: number | null): string {
  return dayIndex === null
    ? "bg-surface border-ink-muted/60"
    : (CHIP[dayIndex % CHIP.length] ?? "");
}
