import type { Meta } from "@storybook/react-vite";
import { localDate } from "@workout-logger/core";
import { exerciseId } from "@workout-logger/exercises";
import { expect, userEvent, within } from "storybook/test";
import { deviceTimeZone } from "../../lib/format.ts";
import { empty, withHistory } from "../../stories/fixtures.ts";
import { pageStory } from "../../stories/page.tsx";

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
    await userEvent.click(
      canvas.getByRole("button", { name: "Reps at a weight" }),
    );
    const weight = canvas.getByRole("combobox", { name: "Weight" });
    await expect(weight).toBeVisible();
    await expect(
      canvas.getByRole("img", { name: "Reps at a weight" }),
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
    await expect(
      within(sessions).getByRole("link", { name: /Lower/ }),
    ).toHaveAttribute("href", expect.stringMatching(/^\/sessions\//));
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
    await expect(canvas.getByRole("cell", { name: "Legs" })).toBeVisible();
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
