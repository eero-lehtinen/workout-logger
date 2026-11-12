import { SystemBars, SystemBarsStyle } from "@capacitor/core";
import { isNative } from "./platform.ts";
import { readPreference, usePreference } from "./preference.ts";

/*
 * The color theme is a view preference of this device, not a synced setting:
 * a phone and a PC may want different ones, and it must apply before the
 * database loads. The inline script in index.html sets `data-theme` before
 * the first paint and must use the same storage key and values.
 */

export type Theme = "system" | "light" | "dark";

const KEY = "theme";
const VALUES = ["system", "light", "dark"] as const satisfies Theme[];

/** At startup: the inline script sets only `data-theme`. */
export function initTheme() {
  applyTheme(readPreference<Theme>(KEY, VALUES, "system"));
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, set] = usePreference<Theme>(KEY, VALUES, "system");
  return [
    theme,
    (next) => {
      set(next);
      applyTheme(next);
    },
  ];
}

const SCHEME_MEDIA = {
  light: "(prefers-color-scheme: light)",
  dark: "(prefers-color-scheme: dark)",
};

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;

  // The browser picks a theme-color by media query; a forced theme pins its own.
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"][data-scheme]',
  )) {
    const scheme = meta.dataset.scheme as "light" | "dark";
    meta.media =
      theme === "system"
        ? SCHEME_MEDIA[scheme]
        : theme === scheme
          ? "all"
          : "not all";
  }

  // The app draws under the system bars, and their icons follow the system
  // theme unless told otherwise: light icons on a forced light theme vanish.
  if (isNative) {
    void SystemBars.setStyle({
      style:
        theme === "light"
          ? SystemBarsStyle.Light
          : theme === "dark"
            ? SystemBarsStyle.Dark
            : SystemBarsStyle.Default,
    });
  }
}
