import type { Language } from "../../i18n/index.ts";
import { echarts } from "./echarts.ts";

type LocaleOption = Parameters<typeof echarts.registerLocale>[1];

let registeredFinnish = false;

/**
 * ECharts' name for a language, for the month names on a time axis. It ships
 * English; Finnish is built from Intl, whose short month names suit a date
 * like "5. tammik." better than ECharts' own Finnish file.
 */
export function chartLocale(language: Language): string {
  if (language !== "fi") return "EN";
  if (!registeredFinnish) {
    registeredFinnish = true;
    echarts.registerLocale("FI", finnishTime());
  }
  return "FI";
}

function finnishTime(): LocaleOption {
  const names = (
    options: Intl.DateTimeFormatOptions,
    count: number,
    at: (i: number) => Date,
  ) =>
    Array.from({ length: count }, (_, i) =>
      new Intl.DateTimeFormat("fi-FI", { ...options, timeZone: "UTC" }).format(
        at(i),
      ),
    );
  const month = (i: number) => new Date(Date.UTC(2024, i, 1));
  // 2023-01-01 was a Sunday, which is index 0 in ECharts.
  const day = (i: number) => new Date(Date.UTC(2023, 0, 1 + i));
  return {
    time: {
      month: names({ month: "long" }, 12, month),
      monthAbbr: names({ month: "short" }, 12, month),
      dayOfWeek: names({ weekday: "long" }, 7, day),
      dayOfWeekAbbr: names({ weekday: "short" }, 7, day),
    },
  } as LocaleOption;
}
