/** Options for `numberFormat` / `dateFormat`, which follow the UI language. */

export const ONE_DECIMAL = {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
} satisfies Intl.NumberFormatOptions;

/** A date from `dateFromIso`, which is UTC midnight. */
export const SHORT_DATE = {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
} satisfies Intl.DateTimeFormatOptions;
