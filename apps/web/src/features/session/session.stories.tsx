import type { Meta } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import {
  empty,
  idleEnded,
  inPounds,
  running,
  timed,
  withHistory,
} from "../../stories/fixtures.ts";
import { pageStory } from "../../stories/page.tsx";

export default {
  title: "Screens/Session",
} satisfies Meta;

export const TodayEmpty = pageStory({ fixture: empty, url: () => "/" });

export const TodayRunning = pageStory({
  fixture: running,
  url: () => "/",
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/Running since/),
    ).toBeVisible();
  },
});

export const TodayRunningPc = pageStory({
  fixture: running,
  url: () => "/",
  viewport: "pc",
});

export const TodayDark = pageStory({
  fixture: running,
  url: () => "/",
  theme: "dark",
});

export const StartNoRoutines = pageStory({
  fixture: empty,
  url: () => "/start",
});

export const StartNextDay = pageStory({
  fixture: withHistory,
  url: () => "/start",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("button", { name: /Upper/ }),
    ).toHaveTextContent("Next");
    await expect(
      canvas.getByRole("button", { name: /Lower/ }),
    ).toHaveTextContent("Last time");
  },
});

export const SessionRunning = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}`,
});

export const SessionRunningPc = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}`,
  viewport: "pc",
});

export const SessionIdle = pageStory({
  fixture: idleEnded,
  url: (ids) => `/sessions/${ids.idleSessionId}`,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/Idle since/),
    ).toBeVisible();
  },
});

export const LoggingWithMarkers = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const today = await canvas.findByRole("button", { name: /^Edit set 1/ });
    await expect(today).toHaveAccessibleName(/Personal record/);
    await expect(
      canvas.getByRole("button", { name: /^Edit set 2/ }),
    ).toHaveAccessibleName(/Weight increase/);
    await userEvent.click(canvas.getByRole("button", { name: "Log set 3" }));
    await expect(
      await canvas.findByRole("button", { name: /^Edit set 3/ }),
    ).toBeVisible();
  },
});

export const LoggingPc = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  viewport: "pc",
});

export const LoggingDark = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  theme: "dark",
});

export const EarlierSessions = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Earlier sessions" }),
    );
    await expect(
      canvas.getAllByRole("button", { name: /^Use set 1 95 × 8 from/ }),
    ).toHaveLength(1);
  },
});

export const EditSetInFooter = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const reps = () => canvas.getByLabelText("Reps");
    await canvas.findByRole("button", { name: "Log set 3" });
    const draft = (reps() as HTMLInputElement).value;

    await userEvent.click(canvas.getByRole("button", { name: /^Edit set 1/ }));
    await expect(canvas.getByText("Editing set 1")).toBeVisible();
    await expect(reps()).toHaveValue("8");
    await userEvent.click(canvas.getByRole("button", { name: "More reps" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save set 1" }));

    await expect(
      await canvas.findByRole("button", { name: /^Edit set 1: 102.5 × 9/ }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Log set 3" }),
    ).toBeVisible();
    await expect(reps()).toHaveValue(draft);

    await userEvent.click(canvas.getByRole("button", { name: /^Edit set 2/ }));
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByText("Editing set 2")).toBeNull();
  },
});

export const UndoToastDark = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  theme: "dark",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: /^Edit set 2/ }),
    );
    await userEvent.click(
      await body.findByRole("button", { name: "Delete set" }),
    );
    await expect(
      await body.findByRole("button", { name: "Undo" }),
    ).toBeEnabled();
  },
});

export const LoggingInPounds = pageStory({
  fixture: inPounds,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
});

export const LoggingTimed = pageStory({
  fixture: timed,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.plankId}`,
});

export const LoggingIntoIdleSession = pageStory({
  fixture: idleEnded,
  url: (ids) => `/sessions/${ids.idleSessionId}/${ids.idleSquatId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Log set 3" }),
    );
    // The dialog renders in a portal outside the canvas.
    const dialog = within(canvasElement.ownerDocument.body);
    const prompt = await dialog.findByRole("alertdialog", {
      name: "This session has ended",
    });
    await expect(
      within(prompt).getByRole("button", { name: "Continue that session" }),
    ).toBeEnabled();
  },
});
