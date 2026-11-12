/** The first few exercises of a day, e.g. "Back Squat, Barbell Row, +1". */
export function exerciseSummary(names: readonly string[], shown = 2): string {
  const first = names.slice(0, shown);
  const rest = names.length - first.length;
  return rest > 0 ? `${first.join(", ")}, +${rest}` : first.join(", ");
}
