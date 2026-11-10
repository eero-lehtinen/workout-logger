import type { Meta } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { restTimer } from "../../lib/rest-timer.ts";
import {
  empty,
  idleEnded,
  inPounds,
  running,
  timed,
  timersOff,
  withHistory,
} from "../../stories/fixtures.ts";
import { pageStory } from "../../stories/page.tsx";

export default {
  title: "Screens/Session",
} satisfies Meta;

export const TodayEmpty = pageStory({ fixture: empty, url: () => "/" });

export const PastSessionReadOnly = pageStory({
  fixture: withHistory,
  url: (ids) => `/sessions/${ids.pastSessionId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: /^Squat \(Barbell\)/ }),
    ).toHaveAttribute("href", expect.stringMatching(/\/history$/));
    await expect(
      canvas.queryByRole("button", { name: "Add exercise" }),
    ).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Edit" }));
    await expect(
      await canvas.findByRole("button", { name: "Add exercise" }),
    ).toBeVisible();
  },
});

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

export const SessionTimerHidden = pageStory({
  fixture: timersOff,
  url: (ids) => `/sessions/${ids.sessionId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/Running since/)).toBeVisible();
    await expect(canvas.queryByText(/^\d+:\d\d$/)).toBeNull();
    await expect(
      canvas.getByRole("button", { name: "End session" }),
    ).toBeVisible();
  },
});

export const SessionIdle = pageStory({
  fixture: idleEnded,
  url: (ids) => `/sessions/${ids.idleSessionId}`,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        /^Lasted \d+(h \d+)?m, no sets since/,
      ),
    ).toBeVisible();
  },
});

export const LoggingWithMarkers = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("button", { name: /^Edit set 1/ });

    // Today's set 1 is a PR over last time's set 1 (100 × 8).
    const [todayPr] = canvas.getAllByRole("button", {
      name: "Personal record",
    });
    await userEvent.click(todayPr as HTMLElement);
    const pr = await body.findByRole("dialog", { name: /Personal record/ });
    await expect(pr).toHaveTextContent(
      /This set129\.8 kg e1RMBest before126\.7 kg e1RM100 × 8 on /,
    );
    await userEvent.keyboard("{Escape}");

    await userEvent.click(
      canvas.getByRole("button", { name: "Weight increase" }),
    );
    const increase = await body.findByRole("dialog", {
      name: /Weight increase/,
    });
    await expect(increase).toHaveTextContent(
      /This set102\.5 kgLast time, set 2100 kg100 × 8 on /,
    );
    await userEvent.keyboard("{Escape}");

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

export const RoutineFromSession = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("link", { name: "Edit routine" }),
    );
    const back = await canvas.findByRole("link", { name: "Back to session" });
    // The session's day is outlined and the others aren't.
    const days = canvasElement.querySelectorAll('[id^="day-"]');
    await expect(days).toHaveLength(2);
    await expect(days[0]).toHaveClass("ring-2");
    await expect(days[1]).not.toHaveClass("ring-2");
    await userEvent.click(back);
    await expect(
      await canvas.findByRole("heading", { name: "Upper" }),
    ).toBeVisible();
  },
});

export const ReorderByKeyboard = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const names = () =>
      canvas
        .getAllByRole("link", { name: /\(Barbell\)/ })
        .map((link) => link.querySelector("p")?.textContent);
    const grip = await canvas.findByRole("button", {
      name: "Move Bench Press (Barbell)",
    });
    grip.focus();
    await userEvent.keyboard("[Space]");
    await userEvent.keyboard("[ArrowDown]");
    await userEvent.keyboard("[Space]");
    await waitFor(() =>
      expect(names()).toEqual([
        "Bent-Over Row (Barbell)",
        "Bench Press (Barbell)",
        "Overhead Press (Barbell)",
      ]),
    );
  },
});

export const AddExerciseByMuscleGroup = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add exercise" }),
    );
    const picker = within(
      await body.findByRole("dialog", { name: "Add exercise" }),
    );
    await userEvent.click(await picker.findByRole("button", { name: "Legs" }));
    await expect(
      await picker.findByRole("button", { name: /^Squat \(Barbell\)/ }),
    ).toBeVisible();
    await expect(
      picker.queryByRole("button", { name: /^Bench Press \(Barbell\)/ }),
    ).toBeNull();

    await userEvent.type(
      picker.getByRole("searchbox", { name: "Search exercises" }),
      "press",
    );
    await expect(
      await picker.findByRole("button", { name: /^Leg Press/ }),
    ).toBeVisible();
    await expect(
      picker.queryByRole("button", { name: /^Overhead Press/ }),
    ).toBeNull();
  },
});

export const RemoveFromSession = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Remove from session" }),
    );
    await canvas.findByRole("heading", { name: "Upper" });
    await waitFor(() =>
      expect(canvas.queryByRole("link", { name: /^Bench Press/ })).toBeNull(),
    );
  },
});

export const NoRoutineLinkWhenAdHoc = pageStory({
  fixture: idleEnded,
  url: (ids) => `/sessions/${ids.idleSessionId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Ad hoc session" });
    await expect(
      canvas.queryByRole("link", { name: "Edit routine" }),
    ).toBeNull();
  },
});

export const SettingsFromLogging = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("link", { name: "Exercise settings" }),
    );
    await canvas.findByRole("heading", { name: "Edit exercise" });
    await expect(
      canvas.getByRole("link", { name: "Back to logging" }),
    ).toBeVisible();
    const rest = canvas.getByLabelText(/Rest time/);
    await userEvent.clear(rest);
    await userEvent.type(rest, "3:00");
    await userEvent.click(
      canvas.getByRole("button", { name: "Save exercise" }),
    );

    await canvas.findByRole("button", { name: "Log set 3" });
    await userEvent.click(canvas.getByRole("button", { name: "Log set 3" }));
    // The countdown may already have ticked once.
    await expect(await canvas.findByText(/^(3:00|2:5\d)$/)).toBeVisible();
  },
});

export const RestTimerOff = pageStory({
  fixture: timersOff,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The timer is a module singleton, so an earlier story may have left one.
    restTimer.skip();
    await userEvent.click(
      await canvas.findByRole("button", { name: "Log set 3" }),
    );
    await canvas.findByRole("button", { name: /^Edit set 3/ });
    await expect(
      canvas.queryByRole("button", { name: "Skip rest" }),
    ).toBeNull();
  },
});

async function logSetAndLeave(canvas: ReturnType<typeof within>) {
  await userEvent.click(
    await canvas.findByRole("button", { name: "Log set 3" }),
  );
  await canvas.findByRole("button", { name: "Skip rest" });
  await userEvent.click(canvas.getByRole("link", { name: "Back to session" }));
  await canvas.findByRole("heading", { name: "Upper", level: 1 });
}

export const RestBarOpensExercise = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await logSetAndLeave(canvas);
    await userEvent.click(canvas.getByRole("link", { name: /^Rest \d/ }));
    await expect(
      await canvas.findByRole("button", { name: "Log set 4" }),
    ).toBeVisible();
    await expect(restTimer.getState()?.finished).toBe(false);
    restTimer.skip();
  },
});

export const RestOverOpensExercise = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await logSetAndLeave(canvas);
    restTimer.adjust(-60 * 60);
    await userEvent.click(
      await canvas.findByRole("link", { name: "Rest over" }),
    );
    await expect(
      await canvas.findByRole("button", { name: "Log set 4" }),
    ).toBeVisible();
    await expect(restTimer.getState()).toBeNull();
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

export const TypeOverPrefill = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Log set 3" });
    const reps = canvas.getByLabelText("Reps") as HTMLInputElement;
    await expect(reps.value).not.toBe("");

    // A tap must not select the value: a selection opens the phone's copy
    // and paste bar. Typing still replaces the prefilled value.
    await userEvent.click(reps);
    await expect(reps.selectionStart).toBe(reps.selectionEnd);
    await userEvent.type(reps, "12", { skipClick: true });
    await expect(reps).toHaveValue("12");

    await userEvent.type(reps, "{Backspace}5", { skipClick: true });
    await expect(reps).toHaveValue("15");
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
