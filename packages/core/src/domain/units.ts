/** Display units and rounding. Storage is always kg. See docs/architecture.md#units-and-rounding. */

export type WeightUnit = "kg" | "lb";

/** Exact by definition. */
export const KG_PER_LB = 0.45359237;

/** Weight comparisons for records use this, so unit conversion can't create false records. */
export const WEIGHT_EPSILON_KG = 1e-6;

export const DEFAULT_WEIGHT_INCREMENT: Readonly<Record<WeightUnit, number>> = {
  kg: 2.5,
  lb: 5,
};

/** Converts an entered value to kg, unrounded, so converting back gives the entered value. */
export function toKg(value: number, unit: WeightUnit): number {
  return unit === "kg" ? value : value * KG_PER_LB;
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === "kg" ? kg : kg / KG_PER_LB;
}

const roundingFormats = new Map<number, Intl.NumberFormat>();

/** Rounds half away from zero on the decimal value, e.g. 220.4622 → 220.46. */
export function roundTo(value: number, decimals: number): number {
  let format = roundingFormats.get(decimals);
  if (!format) {
    format = new Intl.NumberFormat("en-US", {
      maximumFractionDigits: decimals,
      useGrouping: false,
    });
    roundingFormats.set(decimals, format);
  }
  return Number(format.format(value));
}

/** A weight in the display unit, rounded to 2 decimals. */
export function displayWeight(kg: number, unit: WeightUnit): number {
  return roundTo(fromKg(kg, unit), 2);
}

/** e1RM and other derived values are shown with 1 decimal. */
export function displayDerived(kg: number, unit: WeightUnit): number {
  return roundTo(fromKg(kg, unit), 1);
}

/**
 * Text for a weight in the display unit: at most 2 decimals, trailing zeros
 * trimmed (`100`, `102.5`, `220.46`), with the locale's decimal separator.
 */
export function formatWeight(
  kg: number,
  unit: WeightUnit,
  locale?: string,
): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(fromKg(kg, unit));
}

/**
 * The +/- step in the display unit: the exercise's own increment (stored in
 * kg) if set, else the default for the unit.
 */
export function weightIncrement(
  unit: WeightUnit,
  exerciseIncrementKg: number | null,
  defaultIncrement: number = DEFAULT_WEIGHT_INCREMENT[unit],
): number {
  return exerciseIncrementKg == null
    ? defaultIncrement
    : fromKg(exerciseIncrementKg, unit);
}

/**
 * The +/- buttons: snap to the nearest multiple of the increment, then step.
 * A converted 220.46 lb becomes 225 after +, not 225.46. Never below zero.
 */
export function stepWeight(
  value: number,
  increment: number,
  direction: 1 | -1,
): number {
  const snapped = Math.round(value / increment) * increment;
  // Rounding removes float noise such as 0.30000000000000004.
  return Math.max(0, roundTo(snapped + direction * increment, 9));
}
