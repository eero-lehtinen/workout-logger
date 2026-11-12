import { install } from "@sinonjs/fake-timers";

/**
 * The instant every story starts at. Fixtures place sessions relative to now,
 * so a real clock near midnight pushes "52 minutes ago" onto yesterday and the
 * screen changes. Midday local time keeps every fixture on the intended day.
 */
export const STORY_NOW = new Date(2026, 5, 17, 12).getTime();

/** Fakes `Date` and `Temporal.Now`; the clock still ticks for timers and `useNow`. */
const clock = install({
  now: STORY_NOW,
  toFake: ["Date", "Temporal"],
  shouldAdvanceTime: true,
});
import.meta.hot?.dispose(() => clock.uninstall());

export function resetStoryClock(): void {
  clock.setSystemTime(STORY_NOW);
}
