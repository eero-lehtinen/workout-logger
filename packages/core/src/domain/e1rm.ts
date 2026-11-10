export const DEFAULT_E1RM_REP_CAP = 12;

/** Epley. Undefined above repCap, where the estimate is too unreliable. */
export function estimateOneRepMax(
  weightKg: number,
  reps: number,
  repCap: number = DEFAULT_E1RM_REP_CAP,
): number | undefined {
  if (!Number.isInteger(reps) || reps < 1 || reps > repCap) {
    return undefined;
  }
  // Epley gives w * 31/30 for a single; a performed single is the 1RM itself.
  if (reps === 1) {
    return weightKg;
  }
  return weightKg * (1 + reps / 30);
}
