import type { Meta } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { empty, withRoutine } from "../../stories/fixtures.ts";
import { pageStory } from "../../stories/page.tsx";

export default {
  title: "Screens/Routines",
} satisfies Meta;

export const ListEmpty = pageStory({ fixture: empty, url: () => "/routines" });

export const List = pageStory({ fixture: withRoutine, url: () => "/routines" });

export const Editor = pageStory({
  fixture: withRoutine,
  url: (ids) => `/routines/${ids.routineId}`,
});

export const EditorPc = pageStory({
  fixture: withRoutine,
  url: (ids) => `/routines/${ids.routineId}`,
  viewport: "pc",
});

export const SlotNoteAndRest = pageStory({
  fixture: withRoutine,
  url: (ids) => `/routines/${ids.routineId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const note = canvas.getByRole("textbox", {
      name: "Note for Bench Press (Barbell)",
    });
    await userEvent.type(note, "heavy, 6-10{Enter}");
    const rest = canvas.getByRole("textbox", {
      name: "Rest for Bench Press (Barbell), m:ss",
    });
    await userEvent.type(rest, "3:00{Enter}");
    await waitFor(() => expect(rest).toHaveValue("3:00"));
    await expect(note).toHaveValue("heavy, 6-10");
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
