import type { SetValues } from "./markers.ts";

const EMPTY: SetValues = {
  weight_kg: null,
  reps: null,
  duration_s: null,
  distance_m: null,
};

/**
 * Input values for the next set of an exercise in this session.
 *
 * - Set 1 copies set 1 of the previous performance.
 * - Set n copies the weight of this session's set n-1, and the reps (or
 *   duration and distance) of the previous performance's set n, or of this
 *   session's set n-1 if the previous performance has no set n.
 */
export function prefillNextSet(
  current: readonly SetValues[],
  previous: readonly SetValues[] | null,
): SetValues {
  const n = current.length;
  const last = current[n - 1];
  if (!last) return pick(previous?.[0] ?? EMPTY);
  const effort = previous?.[n] ?? last;
  return {
    weight_kg: last.weight_kg,
    reps: effort.reps,
    duration_s: effort.duration_s,
    distance_m: effort.distance_m,
  };
}

function pick({
  weight_kg,
  reps,
  duration_s,
  distance_m,
}: SetValues): SetValues {
  return { weight_kg, reps, duration_s, distance_m };
}
