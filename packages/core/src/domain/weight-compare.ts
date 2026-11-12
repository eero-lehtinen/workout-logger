import type { SetValues } from "./markers.ts";
import { WEIGHT_EPSILON_KG } from "./units.ts";

export function hasWeight(set: Pick<SetValues, "weight_kg">) {
  return (set.weight_kg ?? 0) > WEIGHT_EPSILON_KG;
}

export function sameWeight(a: number, b: number) {
  return Math.abs(a - b) <= WEIGHT_EPSILON_KG;
}

/** `a > b` beyond float noise, for weights and values derived from them. */
export function greater(a: number, b: number) {
  return a > b + WEIGHT_EPSILON_KG;
}
