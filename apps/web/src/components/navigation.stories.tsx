import type { Meta } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { watchForBlank } from "../stories/blank.ts";
import { running } from "../stories/fixtures.ts";
import { pageStory } from "../stories/page.tsx";

export default {
  title: "Screens/Navigation",
} satisfies Meta;

/**
 * A screen opens over the previous one, which stays until the new one has
 * its data: the shell never shows an empty frame between them. Visits the
 * screens with the most queries, and a search-param change.
 */
export const NoBlankBetweenScreensPc = pageStory({
  fixture: running,
  url: () => "/",
  viewport: "pc",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = within(canvas.getByRole("navigation", { name: "Main" }));
    const open = async (link: HTMLElement, heading: string | RegExp) => {
      await userEvent.click(link);
      await canvas.findByRole("heading", { level: 1, name: heading });
    };
    await canvas.findByRole("heading", { level: 1, name: "Today" });
    const blanked = watchForBlank(canvasElement);

    await open(nav.getByRole("link", { name: "History" }), "History");
    const monthButton = () =>
      canvas.getByRole("button", { name: /, Choose month$/ });
    const thisMonth = monthButton().getAttribute("aria-label");
    await userEvent.click(
      canvas.getByRole("button", { name: "Previous month" }),
    );
    await waitFor(() =>
      expect(monthButton().getAttribute("aria-label")).not.toBe(thisMonth),
    );
    await open(nav.getByRole("link", { name: "Routines" }), "Routines");
    await open(
      canvas.getByRole("link", { name: /^Upper\/Lower/ }),
      /Upper\/Lower|Routine/,
    );
    await open(nav.getByRole("link", { name: "Exercises" }), "Exercises");
    await open(
      canvas.getByRole("link", { name: /^Barbell Bench Press/ }),
      /Barbell Bench Press|Exercise/,
    );
    await open(nav.getByRole("link", { name: "Settings" }), "Settings");
    await open(nav.getByRole("link", { name: /^Today/ }), "Today");
    await open(canvas.getByRole("link", { name: /Continue/ }), "Upper");
    await open(
      canvas.getByRole("link", { name: /^Done Barbell Row/ }),
      "Barbell Row",
    );
    await userEvent.click(
      canvas.getAllByRole("link", {
        name: "Exercise history",
      })[0] as HTMLElement,
    );
    await canvas.findByRole("heading", { level: 2, name: "Progress" });
    await expect(blanked()).toBe(false);
  },
});
