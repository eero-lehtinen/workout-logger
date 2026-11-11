/**
 * An exercise name's trailing parenthesized part, which by catalog
 * convention is its equipment: "Bench Press (Barbell)".
 */
export function splitEquipment(name: string): {
  base: string;
  equipment: string | null;
} {
  const match = /^(.*\S)\s+\(([^()]+)\)$/.exec(name);
  return match?.[1] && match[2]
    ? { base: match[1], equipment: match[2] }
    : { base: name, equipment: null };
}

/** The first few exercises of a day, e.g. "Bench Press, Bent-Over Row, +1". */
export function exerciseSummary(names: readonly string[], shown = 2): string {
  const first = names.slice(0, shown).map((n) => splitEquipment(n).base);
  const rest = names.length - first.length;
  return rest > 0 ? `${first.join(", ")}, +${rest}` : first.join(", ");
}
