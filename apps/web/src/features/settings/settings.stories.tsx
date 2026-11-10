import type { Meta } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { watchInstall } from "../../lib/install.ts";
import { empty, inPounds, timersOff } from "../../stories/fixtures.ts";
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

export const TimersOff = pageStory({
  fixture: timersOff,
  url: () => "/settings",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rest = canvas.getByRole("switch", { name: "Rest timer" });
    await expect(rest).not.toBeChecked();
    await expect(
      canvas.getByRole("switch", { name: "Session timer" }),
    ).not.toBeChecked();
    await expect(canvas.queryByLabelText("Rest time")).toBeNull();

    await userEvent.click(rest);
    await waitFor(() => expect(rest).toBeChecked());
    await expect(canvas.getByLabelText("Rest time")).toBeVisible();
  },
});
