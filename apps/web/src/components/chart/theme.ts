import { useSyncExternalStore } from "react";

/** Colors a chart may use: the app's tokens, by name. */
export type ChartColor =
  | "ink"
  | "ink-muted"
  | "pr"
  | "record"
  | "increase"
  | "danger"
  | `day-${1 | 2 | 3 | 4 | 5 | 6}`;

export interface ChartTheme {
  /** Resolved `rgb()` values of the tokens in the current theme. */
  colors: Record<ChartColor, string>;
  /** Gridlines and axes. */
  rule: string;
  /** Tooltip and other floating backgrounds. */
  raised: string;
  background: string;
  font: string;
}

const TOKENS: ChartColor[] = [
  "ink",
  "ink-muted",
  "pr",
  "record",
  "increase",
  "danger",
  "day-1",
  "day-2",
  "day-3",
  "day-4",
  "day-5",
  "day-6",
];

let cached: { key: string; theme: ChartTheme } | undefined;

/**
 * Canvas and SVG charts can't use CSS variables or `light-dark()` directly,
 * so the tokens are resolved here, and again whenever the theme changes.
 */
function resolve(): ChartTheme {
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.append(probe);
  const read = (token: string) => {
    probe.style.color = `var(--${token})`;
    return getComputedStyle(probe).color;
  };
  const colors = Object.fromEntries(TOKENS.map((t) => [t, read(t)])) as Record<
    ChartColor,
    string
  >;
  const theme = {
    colors,
    rule: read("rule"),
    raised: read("raised"),
    background: read("chalk"),
    font: getComputedStyle(document.body).fontFamily,
  };
  probe.remove();
  return theme;
}

const darkScheme = matchMedia("(prefers-color-scheme: dark)");

/** What decides the theme: a forced `data-theme`, else the system's. */
function themeKey() {
  return `${document.documentElement.dataset.theme ?? ""}|${darkScheme.matches}`;
}

function subscribe(onChange: () => void) {
  darkScheme.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => {
    darkScheme.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

/**
 * The cache is keyed by the theme rather than cleared by the listeners: a
 * chart that mounts after a theme change, with no chart mounted to hear it,
 * would otherwise get the old colors.
 */
function snapshot(): ChartTheme {
  const key = themeKey();
  if (cached?.key !== key) cached = { key, theme: resolve() };
  return cached.theme;
}

export function useChartTheme(): ChartTheme {
  return useSyncExternalStore(subscribe, snapshot);
}
