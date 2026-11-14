import type { Meta } from "@storybook/react-vite";
import { localDate } from "@workout-logger/core";
import { exerciseId } from "@workout-logger/exercises";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { deviceTimeZone } from "../../lib/format.ts";
import {
  empty,
  running,
  setRecordHistory,
  withBusyDays,
  withHistory,
  withMonths,
} from "../../stories/fixtures.ts";
import { pageStory } from "../../stories/page.tsx";
import { choose } from "../../stories/select.ts";

export default {
  title: "Screens/History",
} satisfies Meta;

const bench = `/exercises/${exerciseId("barbell_bench_press")}/history`;

/** The fixture's last Lower session, 3 days ago. */
const lowerDay = () =>
  localDate(Date.now() - 3 * 24 * 3600_000, deviceTimeZone());

export const ExerciseHistory = pageStory({
  fixture: withHistory,
  url: () => bench,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Records" }),
    ).toBeVisible();
    await expect(canvas.getByRole("img", { name: "Best e1RM" })).toBeVisible();
    await expect(
      canvas.getByText("Best e1RM", { selector: "p" }),
    ).toBeVisible();
  },
});

/** Only today's set 2 beats every earlier set with its number. */
export const ExerciseHistorySetRecords = pageStory({
  fixture: setRecordHistory,
  url: () => bench,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getAllByRole("img", { name: "Set record" }),
    ).toHaveLength(1);
  },
});

export const ExerciseHistoryFinnish = pageStory({
  fixture: withHistory,
  url: () => bench,
  language: "fi",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Ennätykset" }),
    ).toBeVisible();
    await expect(canvas.getByText("3 treeniä")).toBeVisible();
    await expect(canvas.getByRole("combobox", { name: "Näytä" })).toBeVisible();
  },
});

export const ExerciseHistoryPc = pageStory({
  fixture: withHistory,
  url: () => bench,
  viewport: "pc",
});

export const ExerciseHistoryDark = pageStory({
  fixture: withHistory,
  url: () => bench,
  theme: "dark",
});

export const ExerciseHistoryMetrics = pageStory({
  fixture: withHistory,
  url: () => bench,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await choose(canvasElement, "Show", "Reps at a weight");
    const weight = canvas.getByRole("combobox", { name: "At weight" });
    await expect(weight).toBeVisible();
    await expect(
      await canvas.findByRole("img", { name: "Reps at a weight" }),
    ).toBeVisible();
    await choose(canvasElement, "Show", "Every set's e1RM");
    await expect(await canvas.findByText("Set 2")).toBeVisible();
    await expect(
      canvas.queryByRole("switch", { name: "Trend line" }),
    ).toBeNull();
    await choose(canvasElement, "Show", "Sets per week");
    await expect(
      await canvas.findByRole("img", { name: "Sets per week" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Most reps" }));
    await expect(
      canvas.getByRole("columnheader", { name: "Reps" }),
    ).toBeVisible();
  },
});

/**
 * The trend line states its rate and hides with its switch. The chart choice
 * and the switch carry over to the next exercise.
 */
export const ExerciseHistoryTrend = pageStory({
  fixture: withHistory,
  url: () => bench,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rate = await canvas.findByText(
      /^Trend \+[\d.,]+ kg per month$/,
      {},
      {
        timeout: 5000,
      },
    );
    await expect(rate).toBeVisible();
    await choose(canvasElement, "Show", "Heaviest weight");
    await userEvent.click(canvas.getByRole("switch", { name: "Trend line" }));
    await expect(canvas.queryByText(/per month$/)).toBeNull();

    await userEvent.click(
      canvas.getByRole("link", { name: "Back to exercises" }),
    );
    await userEvent.click(
      await canvas.findByRole("link", { name: /^Back Squat/ }),
    );
    await canvas.findByRole("heading", { name: "Back Squat" });
    await expect(
      canvas.getByRole("combobox", { name: "Show" }),
    ).toHaveTextContent("Heaviest weight");
    await expect(
      canvas.getByRole("switch", { name: "Trend line" }),
    ).not.toBeChecked();
  },
});

/** The full-screen chart and the page's chart show the same choice. */
export const ExerciseHistoryFullScreen = pageStory({
  fixture: withHistory,
  url: () => bench,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const inline = canvas.getByRole("img", { name: "Best e1RM" });
    await userEvent.click(canvas.getByRole("button", { name: "Full screen" }));
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", {
      name: "Barbell Bench Press",
    });
    const full = await within(dialog).findByRole("img", { name: "Best e1RM" });
    await expect(full.clientHeight).toBeGreaterThan(inline.clientHeight);
    await choose(dialog, "Show", "Sets per week");
    await expect(
      await within(dialog).findByRole("img", { name: "Sets per week" }),
    ).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Close" }),
    );
    await expect(
      await canvas.findByRole("img", { name: "Sets per week" }),
    ).toBeVisible();
  },
});

/** The period filters the page and carries over to the history tab. */
export const ExerciseHistoryPeriod = pageStory({
  fixture: withHistory,
  url: () => bench,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("3 sessions")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "3 mo" }));
    await expect(
      canvas.getByText("3 sessions in the last 3 months"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Records in the last 3 months" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("link", { name: "History" }));
    await canvas.findByRole("heading", { name: "History" });
    await expect(
      canvas.getByRole("button", { name: "3 mo", pressed: true }),
    ).toBeVisible();
  },
});

export const ExerciseToSessionAndBack = pageStory({
  fixture: withHistory,
  url: () => bench,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sessions = canvas.getByRole("heading", { name: "Sessions" })
      .parentElement as HTMLElement;
    const [newest] = within(sessions).getAllByRole("link");
    if (!newest) throw new Error("no sessions listed");
    await userEvent.click(newest);
    await userEvent.click(
      await canvas.findByRole("link", { name: "Back to exercise" }),
    );
    await expect(
      await canvas.findByRole("heading", { name: "Barbell Bench Press" }),
    ).toBeVisible();
  },
});

export const ExerciseNeverLogged = pageStory({
  fixture: empty,
  url: () => bench,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        "Sets you log of this exercise show up here.",
      ),
    ).toBeVisible();
  },
});

/** Logging → history → editor → history → logging keeps the way back. */
export const HistoryFromLogging = pageStory({
  fixture: running,
  url: (ids) =>
    `${bench}?sessionId=${ids.sessionId}&sessionExerciseId=${ids.benchId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("link", { name: "Edit exercise" }));
    await userEvent.click(
      await canvas.findByRole("link", { name: "Back to history" }),
    );
    await expect(
      await canvas.findByRole("link", { name: "Back to logging" }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/sessions\/[^/]+\/[^/]+$/),
    );
  },
});

export const Calendar = pageStory({
  fixture: withHistory,
  url: () => `/history?month=${lowerDay().slice(0, 7)}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cell = canvas.getAllByRole("button", { name: /:\s*Lower$/ }).at(-1);
    if (!cell) throw new Error("no Lower session this month");
    await userEvent.click(cell);
    await expect(cell).toHaveAttribute("aria-pressed", "true");
    const sessions = await canvas.findByRole("region", { name: /^\w+day\b/ });
    const session = within(sessions).getByRole("link", { name: /Lower/ });
    await expect(session).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/sessions\//),
    );
    await userEvent.click(session);
    await userEvent.click(
      await canvas.findByRole("link", { name: "Back to history" }),
    );
    await expect(
      await canvas.findByRole("button", { name: /:\s*Lower$/, pressed: true }),
    ).toBeVisible();
  },
});

/** The story clock is June 17 2026. */
export const CalendarMonthPicker = pageStory({
  fixture: withMonths,
  url: () => "/history",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.queryByRole("button", { name: "Today" })).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "June 2026, Choose month" }),
    );
    const picker = await body.findByRole("dialog", { name: "2026" });
    const shown = within(picker).getByRole("button", {
      name: "June 2026: 6 sessions",
      pressed: true,
    });
    await waitFor(() => expect(shown).toHaveFocus());
    await expect(
      within(picker).getByRole("button", { name: "July 2026: 0 sessions" }),
    ).toBeDisabled();
    await expect(
      within(picker).getByRole("button", { name: "Previous year" }),
    ).toBeDisabled();
    await userEvent.click(
      within(picker).getByRole("button", { name: "March 2026: 12 sessions" }),
    );
    await expect(
      await canvas.findByRole("heading", { name: /^March 2026/ }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Today" }));
    await expect(
      await canvas.findByRole("button", {
        name: /^Wednesday, June 17/,
        pressed: true,
      }),
    ).toBeInTheDocument();
  },
});

export const CalendarMonthsPc = pageStory({
  fixture: withMonths,
  url: () => "/history",
  viewport: "pc",
});

/** Keys move the selection; leaving the month shows the new one. */
export const CalendarKeyboard = pageStory({
  fixture: withHistory,
  url: () => "/history",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const today = canvas.getByRole("button", { name: /^Wednesday, June 17/ });
    today.focus();
    await userEvent.keyboard("{ArrowLeft}{ArrowUp}");
    await expect(
      canvas.getByRole("button", { name: /^Tuesday, June 9/, pressed: true }),
    ).toHaveFocus();
    await userEvent.keyboard("{PageDown}");
    await canvas.findByRole("heading", { name: /^July 2026/ });
    await expect(
      await canvas.findByRole("button", {
        name: /^Thursday, July 9/,
        pressed: true,
      }),
    ).toHaveFocus();
    await userEvent.keyboard("{End}");
    await expect(
      canvas.getByRole("button", { name: /^Sunday, July 12/, pressed: true }),
    ).toHaveFocus();
  },
});

/**
 * A day from the next month, then a swipe back, whose ending click doesn't
 * choose a day.
 */
export const CalendarOutsideDayAndSwipe = pageStory({
  fixture: withHistory,
  url: () => "/history",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /^Wednesday, July 1/ }),
    );
    await canvas.findByRole("heading", { name: /^July 2026/ });
    const cell = canvas.getByRole("button", { name: /^Friday, July 10/ });
    const touch = { pointerType: "touch", clientY: 300 };
    fireEvent.pointerDown(cell, { ...touch, clientX: 100 });
    fireEvent.pointerUp(cell, { ...touch, clientX: 260 });
    fireEvent.click(cell, { detail: 1 });
    await canvas.findByRole("heading", { name: /^June 2026/ });
    await expect(
      canvas.getByRole("button", { name: /^Wednesday, June 17/ }),
    ).toHaveAttribute("aria-pressed", "true");
  },
});

export const CalendarFinnish = pageStory({
  fixture: withHistory,
  url: () => `/history?month=${lowerDay().slice(0, 7)}&day=${lowerDay()}`,
  language: "fi",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Edellinen kuukausi" }),
    ).toBeVisible();
    await expect(canvas.getByText("ma")).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Treenitiheys" }),
    ).toBeVisible();
  },
});

export const CalendarPc = pageStory({
  fixture: withHistory,
  url: () => `/history?month=${lowerDay().slice(0, 7)}&day=${lowerDay()}`,
  viewport: "pc",
});

export const CalendarBusyDays = pageStory({
  fixture: withBusyDays,
  url: () => `/history?month=${lowerDay().slice(0, 7)}`,
});

/** Two marks share a day; the third is "+1". */
export const CalendarBusyDaysPc = pageStory({
  fixture: withBusyDays,
  url: () => `/history?month=${lowerDay().slice(0, 7)}`,
  viewport: "pc",
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("+1")).toBeVisible();
  },
});

export const CalendarDark = pageStory({
  fixture: withHistory,
  url: () => `/history?month=${lowerDay().slice(0, 7)}&day=${lowerDay()}`,
  theme: "dark",
});

export const Frequency = pageStory({
  fixture: withHistory,
  url: () => "/history",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("img", { name: "Sessions per week" }),
    ).toBeVisible();
    await expect(canvas.getByRole("rowheader", { name: "Legs" })).toBeVisible();
    await expect(canvas.queryByRole("rowheader", { name: "Quads" })).toBeNull();
    await userEvent.click(canvas.getByRole("switch", { name: "By muscle" }));
    await expect(
      canvas.getByRole("rowheader", { name: "Quads" }),
    ).toBeVisible();
    await expect(canvas.getByRole("cell", { name: "Upper" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "All" }));
    await expect(
      canvas.getByRole("img", { name: "Days between sessions" }),
    ).toBeVisible();
  },
});

export const HistoryEmpty = pageStory({
  fixture: empty,
  url: () => "/history",
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("link", { name: "Start a session" }),
    ).toHaveAttribute("href", "/start");
  },
});
