import type { Meta } from "@storybook/react-vite";
import { localDate } from "@workout-logger/core";
import { exerciseId } from "@workout-logger/exercises";
import { expect, userEvent, within } from "storybook/test";
import { deviceTimeZone } from "../../lib/format.ts";
import { empty, running, withHistory } from "../../stories/fixtures.ts";
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
    await choose(canvasElement, "Metric", "Reps at a weight");
    const weight = canvas.getByRole("combobox", { name: "Weight" });
    await expect(weight).toBeVisible();
    await expect(
      await canvas.findByRole("img", { name: "Reps at a weight" }),
    ).toBeVisible();
    await choose(canvasElement, "Metric", "Every set's e1RM");
    await expect(await canvas.findByText("Set 2")).toBeVisible();
    await expect(
      canvas.queryByRole("switch", { name: "Trend line" }),
    ).toBeNull();
    await choose(canvasElement, "Metric", "Sets per week");
    await expect(
      await canvas.findByRole("img", { name: "Sets per week" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Most reps at weight" }),
    );
    await expect(
      canvas.getByRole("columnheader", { name: "Reps" }),
    ).toBeVisible();
  },
});

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
    await userEvent.click(canvas.getByRole("switch", { name: "Trend line" }));
    await expect(canvas.queryByText(/per month$/)).toBeNull();
  },
});

/** The period filters the page and carries over to the history tab. */
export const ExerciseHistoryPeriod = pageStory({
  fixture: withHistory,
  url: () => bench,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("3 sessions")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "3 months" }));
    await expect(
      canvas.getByText("3 sessions in the last 3 months"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Records in the last 3 months" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("link", { name: "History" }));
    await expect(
      await canvas.findByRole("button", { name: "3 months", pressed: true }),
    ).toBeVisible();
  },
});

/** The metric and the trend switch carry over to the next exercise. */
export const ExerciseHistoryRemembers = pageStory({
  fixture: withHistory,
  url: () => bench,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await choose(canvasElement, "Metric", "Top weight");
    await userEvent.click(canvas.getByRole("switch", { name: "Trend line" }));
    await userEvent.click(
      canvas.getByRole("link", { name: "Back to exercises" }),
    );
    await userEvent.click(
      await canvas.findByRole("link", { name: /^Squat \(Barbell\)/ }),
    );
    await canvas.findByRole("heading", { name: "Squat (Barbell)" });
    await expect(
      canvas.getByRole("combobox", { name: "Metric" }),
    ).toHaveTextContent("Top weight");
    await expect(
      canvas.getByRole("switch", { name: "Trend line" }),
    ).not.toBeChecked();
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
      await canvas.findByRole("heading", { name: "Bench Press (Barbell)" }),
    ).toBeVisible();
  },
});

export const ExerciseNeverLogged = pageStory({
  fixture: empty,
  url: () => bench,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Sets you log of this exercise show up here."),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("link", { name: "Edit exercise" }));
    await canvas.findByRole("heading", { name: "Edit exercise" });
    await userEvent.click(
      canvas.getByRole("link", { name: "Back to history" }),
    );
    await canvas.findByText("Sets you log of this exercise show up here.");
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
    const sessions = await canvas.findByRole("region", { name: /^\w+day, / });
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

export const CalendarPc = pageStory({
  fixture: withHistory,
  url: () => `/history?month=${lowerDay().slice(0, 7)}&day=${lowerDay()}`,
  viewport: "pc",
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
    await userEvent.click(canvas.getByRole("switch", { name: "Show muscles" }));
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
});
