import i18next from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { readPreference, usePreference } from "../lib/preference.ts";
import { en } from "./en/index.ts";
import { fi } from "./fi/index.ts";

/*
 * The UI language is a view preference of this device, like the theme: it
 * must apply before the database loads, and the gate screens shown before
 * that are translated too. "system" follows the browser's languages.
 */

export type Language = "en" | "fi";
export type LanguageChoice = "system" | Language;

const KEY = "language";
const CHOICES = ["system", "en", "fi"] as const satisfies LanguageChoice[];
const SUPPORTED: readonly string[] = ["en", "fi"] satisfies Language[];

function deviceLanguages(): readonly string[] {
  return typeof navigator === "undefined" ? [] : navigator.languages;
}

function resolve(choice: LanguageChoice): Language {
  if (choice !== "system") return choice;
  const base = deviceLanguages()
    .map(baseLanguage)
    .find((tag) => SUPPORTED.includes(tag));
  return (base as Language | undefined) ?? "en";
}

function baseLanguage(tag: string): string {
  return tag.split("-", 1)[0] ?? tag;
}

export const i18n = i18next.createInstance();

i18n.on("languageChanged", (language) => {
  if (typeof document !== "undefined") {
    document.documentElement.lang = language;
  }
});

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fi: { translation: fi } },
  lng: resolve(readPreference<LanguageChoice>(KEY, CHOICES, "system")),
  fallbackLng: "en",
  // React escapes text itself.
  interpolation: { escapeValue: false },
  // The resources are bundled, so init completes before the first render.
  initAsync: false,
});

export function useLanguage(): [
  LanguageChoice,
  (choice: LanguageChoice) => void,
] {
  const [choice, set] = usePreference<LanguageChoice>(KEY, CHOICES, "system");
  return [
    choice,
    (next) => {
      set(next);
      void i18n.changeLanguage(resolve(next));
    },
  ];
}

/** The language in use, re-rendering the caller when it changes. */
export function useCurrentLanguage(): Language {
  return useTranslation().i18n.language as Language;
}

/** For stories and tests, which must not follow the machine's language. */
export function pinLanguage(language: Language) {
  if (i18n.language !== language) void i18n.changeLanguage(language);
}

/**
 * The locale for dates and numbers. The device's own locale when it speaks
 * the UI language, so en-US keeps its 12-hour clock; otherwise the
 * language's main region, so an English UI on a Finnish phone doesn't show
 * Finnish month names.
 */
export function formatLocale(): string {
  const language = i18n.language;
  return (
    deviceLanguages().find((tag) => baseLanguage(tag) === language) ??
    (language === "fi" ? "fi-FI" : "en-GB")
  );
}
