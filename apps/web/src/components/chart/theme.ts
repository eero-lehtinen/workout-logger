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

let cached: ChartTheme | undefined;

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

function subscribe(onChange: () => void) {
  const changed = () => {
    cached = undefined;
    onChange();
  };
  const media = matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", changed);
  const observer = new MutationObserver(changed);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "class", "style"],
  });
  return () => {
    media.removeEventListener("change", changed);
    observer.disconnect();
  };
}

export function useChartTheme(): ChartTheme {
  return useSyncExternalStore(subscribe, () => {
    cached ??= resolve();
    return cached;
  });
}
