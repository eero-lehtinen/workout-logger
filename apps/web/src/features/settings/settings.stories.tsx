import type { Meta } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { watchInstall } from "../../lib/install.ts";
import { empty, inPounds } from "../../stories/fixtures.ts";
import { pageStory } from "../../stories/page.tsx";

export default {
  title: "Screens/Settings",
} satisfies Meta;

export const Defaults = pageStory({ fixture: empty, url: () => "/settings" });

export const InPounds = pageStory({
  fixture: inPounds,
  url: () => "/settings",
});

export const Pc = pageStory({
  fixture: empty,
  url: () => "/settings",
  viewport: "pc",
});

const prompt = fn(async () => {});

/** Chrome has offered its install prompt; dismissing it removes the button. */
export const InstallAvailable = {
  ...pageStory({
    fixture: empty,
    url: () => "/settings",
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await userEvent.click(
        await canvas.findByRole("button", { name: "Install" }),
      );
      await expect(prompt).toHaveBeenCalledOnce();
      await waitFor(() =>
        expect(canvas.queryByRole("button", { name: "Install" })).toBeNull(),
      );
    },
  }),
  beforeEach: () => {
    prompt.mockClear();
    watchInstall();
    window.dispatchEvent(
      Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt,
        userChoice: Promise.resolve({ outcome: "dismissed", platform: "" }),
      }),
    );
  },
};
