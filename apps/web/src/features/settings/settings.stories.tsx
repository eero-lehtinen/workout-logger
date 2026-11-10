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

/** The toggle shows where the browser has the Screen Wake Lock API. */
export const KeepScreenOn = pageStory({
  fixture: empty,
  url: () => "/settings",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const keepOn = await canvas.findByRole("switch", {
      name: "Keep screen on",
    });
    await expect(keepOn).not.toBeChecked();
    await userEvent.click(keepOn);
    await waitFor(() => expect(keepOn).toBeChecked());
  },
});

const realFetch = globalThis.fetch;
const realUserAgent = navigator.userAgent;

/** In a browser on Android, when the server has a release. */
export const AndroidAppOffered = {
  ...pageStory({
    fixture: empty,
    url: () => "/settings",
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const link = await canvas.findByRole("link", { name: "Download" });
      await expect(link).toHaveAttribute("href", "/api/android/apk");
      await expect(canvas.getByText(/^Version 1\.2\.3\./)).toBeVisible();
    },
  }),
  beforeEach: () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () => "Mozilla/5.0 (Linux; Android 16) Chrome/157.0 Mobile",
    });
    globalThis.fetch = fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/api/android/latest")
        ? Response.json({ version: "1.2.3" })
        : new Response(null, { status: 404 }),
    );
    return () => {
      globalThis.fetch = realFetch;
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        get: () => realUserAgent,
      });
    };
  },
};
