import type { Meta } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { restTimer } from "../../lib/rest-timer.ts";
import {
  empty,
  idleEnded,
  inPounds,
  running,
  substituted,
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
      canvas.getByRole("link", { name: /^Back Squat/ }),
    ).toHaveAttribute("href", expect.stringMatching(/\/history\?sessionId=/));
    await expect(
      canvas.getByText("Short on sleep, kept it easy."),
    ).toBeVisible();
    await expect(canvas.getByText("Set 3: knee felt off")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Add exercise to session" }),
    ).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Edit" }));
    await expect(
      await canvas.findByRole("button", { name: "Add exercise to session" }),
    ).toBeVisible();
  },
});

export const PastSessionDark = pageStory({
  fixture: withHistory,
  url: (ids) => `/sessions/${ids.pastSessionId}`,
  theme: "dark",
});

export const PastSessionPc = pageStory({
  fixture: withHistory,
  url: (ids) => `/sessions/${ids.pastSessionId}`,
  viewport: "pc",
});

export const PastSessionToHistoryAndBack = pageStory({
  fixture: withHistory,
  url: (ids) => `/sessions/${ids.pastSessionId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("link", { name: /^Back Squat/ }));
    await userEvent.click(
      await canvas.findByRole("link", { name: "Back to session" }),
    );
    await expect(
      await canvas.findByRole("button", { name: "Edit" }),
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

export const TodayFinnish = pageStory({
  fixture: running,
  url: () => "/",
  language: "fi",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/^Alkoi klo /)).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Tänään" })).toBeVisible();
  },
});

export const StartNoRoutines = pageStory({
  fixture: empty,
  url: () => "/start",
});

/** Each day names its first exercises. */
export const StartNextDay = pageStory({
  fixture: withHistory,
  url: () => "/start",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const upper = await canvas.findByRole("button", { name: /Upper/ });
    await expect(upper).toHaveTextContent("Next");
    await expect(upper).toHaveTextContent(
      "Barbell Bench Press, Barbell Row, +1",
    );
    const lower = canvas.getByRole("button", { name: /Lower/ });
    await expect(lower).not.toHaveTextContent("Next");
    await expect(lower).toHaveTextContent("Back Squat, Romanian Deadlift, +1");
  },
});

/** Several routines: picked with chips. */
export const StartTwoRoutines = pageStory({
  fixture: async (db) => {
    const ids = await withHistory(db);
    await db.run("createRoutine", { name: "Full body" });
    return ids;
  },
  url: () => "/start",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const full = await canvas.findByRole("radio", { name: "Full body" });
    await expect(
      canvas.getByRole("radio", { name: "Upper/Lower" }),
    ).toBeChecked();
    await userEvent.click(full);
    await expect(full).toBeChecked();
    await expect(
      await canvas.findByText(/^This routine has no days\./),
    ).toBeVisible();
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

/**
 * Idle end is derived, so Resume opens the exercise to continue with, and
 * its next set continues the session without asking.
 */
export const ResumeIdleSession = pageStory({
  fixture: idleEnded,
  url: (ids) => `/sessions/${ids.idleSessionId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Resume" }),
    );
    await userEvent.click(
      await canvas.findByRole("button", { name: "Log set 3" }),
    );
    await expect(
      await canvas.findByRole("button", { name: /^Edit set 3/ }),
    ).toBeVisible();
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole("alertdialog"),
    ).toBeNull();
    restTimer.skip();
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

/** On PC the header actions are icons named by tooltips. */
export const LoggingPc = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  viewport: "pc",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const edit = await canvas.findByRole("link", { name: "Edit exercise" });
    await userEvent.hover(edit);
    // The link is an icon, so the only text is the tooltip's.
    const tip = await body.findByText("Edit exercise");
    await waitFor(() => expect(tip).toBeVisible());
  },
});

/** Visible copies only: on phones the session list stays mounted, hidden. */
async function expectNamedOriginal(canvasElement: HTMLElement, count: number) {
  const canvas = within(canvasElement);
  await canvas.findByRole("button", { name: "Log set 1" });
  const named = canvas
    .getAllByText((_, el) => el?.textContent === "Instead of Overhead Press")
    .filter((el) => el.checkVisibility());
  await expect(named).toHaveLength(count);
}

/**
 * The logging screen names the slot's default exercise, as the session list
 * does, and pressing it reopens the substitution picker.
 */
export const LoggingSubstitute = pageStory({
  fixture: substituted,
  url: (ids) => `/sessions/${ids.sessionId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("link", {
        name: "Not started Dumbbell Shoulder Press Instead of Overhead Press",
      }),
    );
    await expectNamedOriginal(canvasElement, 1);

    await userEvent.click(
      canvas.getByRole("button", {
        name: "Instead of Overhead Press",
      }),
    );
    const picker = await body.findByRole("dialog", {
      name: "Instead of Dumbbell Shoulder Press",
    });
    await userEvent.click(
      await within(picker).findByRole("button", {
        name: /^Overhead Press/,
      }),
    );
    await expect(
      await canvas.findByRole("heading", { name: "Overhead Press" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: /^Instead of/ }),
    ).toBeNull();
  },
});

/** Beside the session list, which names it too. */
export const LoggingSubstitutePc = pageStory({
  fixture: substituted,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.substituteId}`,
  viewport: "pc",
  play: async ({ canvasElement }) => expectNamedOriginal(canvasElement, 2),
});

export const LoggingDark = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  theme: "dark",
});

export const LoggingFinnish = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  language: "fi",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("button", { name: "Kirjaa sarja 3" }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Toistot")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Aiemmat treenit" }),
    ).toBeVisible();
  },
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
        .getAllByRole("link", {
          name: /Barbell Bench Press|Barbell Row|Overhead Press/,
        })
        .map((link) => link.querySelector("p")?.textContent);
    const grip = await canvas.findByRole("button", {
      name: "Move Barbell Bench Press",
    });
    grip.focus();
    await userEvent.keyboard("[Space]");
    await userEvent.keyboard("[ArrowDown]");
    await userEvent.keyboard("[Space]");
    await waitFor(() =>
      expect(names()).toEqual([
        "Barbell Row",
        "Barbell Bench Press",
        "Overhead Press",
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
      await canvas.findByRole("button", { name: "Add exercise to session" }),
    );
    const picker = within(
      await body.findByRole("dialog", { name: "Add exercise to session" }),
    );
    await userEvent.click(await picker.findByRole("button", { name: "Legs" }));
    await expect(
      await picker.findByRole("button", { name: /^Back Squat/ }),
    ).toBeVisible();
    await expect(
      picker.queryByRole("button", { name: /^Barbell Bench Press/ }),
    ).toBeNull();

    await userEvent.type(
      picker.getByRole("searchbox", { name: "Search exercises" }),
      "press",
    );
    await expect(
      await picker.findByRole("button", { name: /^Leg Press(?! Calf)/ }),
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
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "More actions" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Remove from session" }),
    );
    await canvas.findByRole("heading", { name: "Upper" });
    await waitFor(() =>
      expect(
        canvas.queryByRole("link", { name: /Barbell Bench Press/ }),
      ).toBeNull(),
    );
  },
});

export const EditNotes = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const exerciseNotes = () =>
      canvas.queryByRole("textbox", {
        name: "Notes on Barbell Bench Press in this session",
      });
    const addNote = await canvas.findByRole("button", { name: "Add note" });
    await expect(exerciseNotes()).toBeNull();

    // Leaving an opened note empty closes it again.
    await userEvent.click(addNote);
    await expect(exerciseNotes()).toHaveFocus();
    await userEvent.tab();
    await expect(exerciseNotes()).toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: "Add note" }));
    await userEvent.keyboard("Elbow ok");
    await userEvent.tab();
    await expect(exerciseNotes()).toHaveValue("Elbow ok");
    await userEvent.click(
      canvas.getByRole("link", { name: "Back to session" }),
    );
    await canvas.findByRole("heading", { name: "Upper" });
    await expect(await canvas.findByText("Elbow ok")).toBeVisible();

    await expect(
      canvas.queryByRole("textbox", { name: "Session notes" }),
    ).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Add session note" }),
    );
    const notes = canvas.getByRole("textbox", { name: "Session notes" });
    await expect(notes).toHaveFocus();
    await userEvent.keyboard("Gym was busy");
    await userEvent.tab();
    // The field shows the stored value again once its edit is saved.
    await waitFor(() => expect(notes).toHaveValue("Gym was busy"));
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
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "More actions" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Edit exercise" }),
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
    await userEvent.click(
      canvas.getByRole("button", { name: "Increase reps" }),
    );
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

    await userEvent.click(canvas.getByRole("button", { name: /^Edit set 2/ }));
    await userEvent.click(
      canvas.getByRole("button", { name: /back to the next set/ }),
    );
    await expect(canvas.queryByText("Editing set 2")).toBeNull();
    await expect(reps()).toHaveValue(draft);
  },
});

/**
 * Every control in the logging footer ends inside its padding and shows all
 * of its content, which a flex row would otherwise hide by squeezing it.
 */
async function expectFooterFits(inFooter: HTMLElement) {
  // The fallback font is wider than Archivo.
  await document.fonts.ready;
  const footer = inFooter.closest("[data-bottom-chrome]")?.firstElementChild
    ?.firstElementChild as HTMLElement;
  const right =
    footer.getBoundingClientRect().right -
    Number.parseFloat(getComputedStyle(footer).paddingRight);
  for (const control of footer.querySelectorAll("button, input")) {
    const name =
      control instanceof HTMLInputElement
        ? `${control.id} = ${control.value}`
        : (control.getAttribute("aria-label") ?? control.textContent);
    await expect(
      control.getBoundingClientRect().right,
      `${name} ends inside the footer`,
    ).toBeLessThanOrEqual(right + 0.5);
    await expect(
      control.scrollWidth,
      `${name} shows all of its content`,
    ).toBeLessThanOrEqual(control.clientWidth);
  }
}

/** Finnish labels are the longest, and they must fit the narrowest phone. */
export const EditSetFinnishNarrow = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  language: "fi",
  viewport: "phoneNarrow",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expectFooterFits(
      await canvas.findByRole("button", { name: "Kirjaa sarja 3" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: /^Muokkaa sarjaa 1/ }),
    );
    await expectFooterFits(
      canvas.getByRole("button", { name: "Tallenna sarja 1" }),
    );
  },
});

export const EditSetNarrow = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  viewport: "phoneNarrow",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expectFooterFits(
      await canvas.findByRole("button", { name: "Log set 3" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: /^Edit set 1/ }));
    await expectFooterFits(canvas.getByRole("button", { name: "Save set 1" }));
  },
});

export const EditSetPc = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  viewport: "pc",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /^Edit set 1/ }),
    );
    await expectFooterFits(canvas.getByRole("button", { name: "Delete set" }));
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
