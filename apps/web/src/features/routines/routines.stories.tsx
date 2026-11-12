import type { Meta } from "@storybook/react-vite";
import { ROUTINES } from "@workout-logger/exercises";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { empty, withRoutine } from "../../stories/fixtures.ts";
import { pageStory } from "../../stories/page.tsx";

export default {
  title: "Screens/Routines",
} satisfies Meta;

export const ListEmpty = pageStory({ fixture: empty, url: () => "/routines" });

export const List = pageStory({ fixture: withRoutine, url: () => "/routines" });

/** New opens the editor with the placeholder name selected, ready to type over. */
export const NewRoutine = pageStory({
  fixture: empty,
  url: () => "/routines",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "New" }));
    const name = await canvas.findByRole("textbox", { name: "Routine name" });
    await waitFor(() => expect(name).toHaveFocus());
    await userEvent.keyboard("Push/Pull{Enter}");
    await waitFor(() => expect(name).toHaveValue("Push/Pull"));
  },
});

/** Adding a built-in routine opens it, ready to edit. */
export const AddBuiltin = pageStory({
  fixture: empty,
  url: () => "/routines",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Eero's Upper/Upper/Lower" }),
    );
    await waitFor(() =>
      expect(
        canvas
          .getAllByRole<HTMLInputElement>("textbox", { name: "Day name" })
          .map((input) => input.value),
      ).toEqual(["Upper A", "Upper B", "Lower"]),
    );
    await expect(
      canvas.getByRole("textbox", { name: "Description" }),
    ).toHaveValue(ROUTINES[0]?.description);
  },
});

/** A description written in the editor shows in the routine list. */
export const Description = pageStory({
  fixture: withRoutine,
  url: (ids) => `/routines/${ids.routineId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Description" }),
      "Four days a week, alternating.",
    );
    await userEvent.tab();
    await userEvent.click(
      canvas.getByRole("link", { name: "Back to routines" }),
    );
    await canvas.findByRole("heading", { name: "Routines" });
    await expect(
      canvas.getByText("Four days a week, alternating.", { selector: "p" }),
    ).toBeVisible();
  },
});

export const ListPc = pageStory({
  fixture: withRoutine,
  url: () => "/routines",
  viewport: "pc",
});

export const ListFi = pageStory({
  fixture: withRoutine,
  url: () => "/routines",
  language: "fi",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Ohjelmat" }),
    ).toBeVisible();
    await expect(canvas.getByText("Valmisohjelmat")).toBeVisible();
  },
});

export const EditorFi = pageStory({
  fixture: withRoutine,
  url: (ids) => `/routines/${ids.routineId}`,
  language: "fi",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: "Takaisin ohjelmiin" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Järjestä päivät" }),
    ).toBeVisible();
  },
});

export const Editor = pageStory({
  fixture: withRoutine,
  url: (ids) => `/routines/${ids.routineId}`,
});

export const EditorPc = pageStory({
  fixture: withRoutine,
  url: (ids) => `/routines/${ids.routineId}`,
  viewport: "pc",
  theme: "dark",
});

/** A slot's row sums it up; its sheet edits it. */
export const SlotNoteAndRest = pageStory({
  fixture: withRoutine,
  url: (ids) => `/routines/${ids.routineId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const row = canvas.getByRole("button", {
      name: /^Barbell Bench Press/,
    });
    await expect(row).toHaveTextContent("or Dumbbell Bench Press");
    await userEvent.click(row);
    const sheet = within(
      await body.findByRole("dialog", { name: "Barbell Bench Press" }),
    );
    const note = sheet.getByRole("textbox", {
      name: "Note for Barbell Bench Press",
    });
    await userEvent.type(note, "heavy, 6-10{Enter}");
    const rest = sheet.getByRole("textbox", {
      name: "Rest for Barbell Bench Press, m:ss",
    });
    await userEvent.type(rest, "3:00{Enter}");
    await waitFor(() => expect(rest).toHaveValue("3:00"));
    await expect(note).toHaveValue("heavy, 6-10");
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(row).toHaveTextContent(
        "heavy, 6-10 · Rest 3:00 · or Dumbbell Bench Press",
      ),
    );
  },
});

export const SlotSheetOpen = pageStory({
  fixture: withRoutine,
  url: (ids) => `/routines/${ids.routineId}`,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: /^Barbell Row/ }),
    );
  },
});

/** The routine's rarer actions wait behind "⋯". */
export const EditorMenu = pageStory({
  fixture: withRoutine,
  url: (ids) => `/routines/${ids.routineId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Duplicate" }),
    );
    await waitFor(() =>
      expect(canvas.getByRole("textbox", { name: "Routine name" })).toHaveValue(
        "Upper/Lower (copy)",
      ),
    );
  },
});

export const DuplicateDay = pageStory({
  fixture: withRoutine,
  url: (ids) => `/routines/${ids.routineId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Duplicate Upper" }),
    );
    await waitFor(() =>
      expect(
        canvas
          .getAllByRole<HTMLInputElement>("textbox", { name: "Day name" })
          .map((input) => input.value),
      ).toEqual(["Upper", "Upper (copy)", "Lower"]),
    );
  },
});

/** Days reorder in a sheet of one-line rows; the editor follows. */
export const ReorderDays = pageStory({
  fixture: withRoutine,
  url: (ids) => `/routines/${ids.routineId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Reorder days" }));
    const sheet = within(
      await body.findByRole("dialog", { name: "Reorder days" }),
    );
    const grip = sheet.getByRole("button", { name: "Move Upper" });
    // The sheet takes focus as it opens.
    await waitFor(() => {
      grip.focus();
      expect(grip).toHaveFocus();
    });
    await userEvent.keyboard("[Space]");
    await userEvent.keyboard("[ArrowDown]");
    await userEvent.keyboard("[Space]");
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        canvas
          .getAllByRole<HTMLInputElement>("textbox", { name: "Day name" })
          .map((input) => input.value),
      ).toEqual(["Lower", "Upper"]),
    );
  },
});

export const ReorderDaysSheet = pageStory({
  fixture: withRoutine,
  url: (ids) => `/routines/${ids.routineId}`,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Reorder days" }),
    );
  },
});
