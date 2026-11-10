import type { Meta } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { type AccountUser, setAccountForStory } from "../../lib/account.ts";
import { watchInstall } from "../../lib/install.ts";
import { setOwnerStatusForStory } from "../../lib/server-status.ts";
import { type SyncState, setSyncStateForStory } from "../../lib/sync.ts";
import { empty, inPounds, timersOff } from "../../stories/fixtures.ts";
import { pageStory } from "../../stories/page.tsx";

export default {
  title: "Screens/Settings",
} satisfies Meta;

export const Defaults = pageStory({ fixture: empty, url: () => "/settings" });

/** Every build shows its commit and build time. */
export const WebBuild = pageStory({
  fixture: empty,
  url: () => "/settings",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Web app build")).toBeVisible();
    await expect(canvas.getByText(/^[0-9a-f]{7}, built /)).toBeVisible();
  },
});

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

/** Forcing a theme overrides the system one and is remembered. */
export const ThemeChoice = pageStory({
  fixture: empty,
  url: () => "/settings",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const root = canvasElement.ownerDocument.documentElement;
    await expect(
      canvas.getByRole("button", { name: "System" }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Dark" }));
    await waitFor(() => expect(root.dataset.theme).toBe("dark"));
    await expect(localStorage.getItem("theme")).toBe("dark");
    await expect(canvas.getByRole("button", { name: "Dark" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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

const alice: AccountUser = {
  id: "u1",
  name: "Alice Example",
  email: "alice@example.com",
  image: null,
  role: "user",
};

/** Shows Settings as `user` sees it, with the given sync state. */
function signedIn(user: AccountUser, sync: Partial<SyncState> = {}) {
  return () => {
    setAccountForStory({ status: "signed-in", user, offline: false });
    setSyncStateForStory(sync);
    return () => {
      setAccountForStory({ status: "unknown" });
      setSyncStateForStory({});
      setOwnerStatusForStory(null);
    };
  };
}

/** Without an account the app works locally and offers sign-in. */
export const SignedOut = pageStory({
  fixture: empty,
  url: () => "/settings",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Sign in with GitHub" }),
    ).toBeVisible();
  },
});

/** Seeded rows wait in the outbox until the first sync. */
export const SignedIn = {
  ...pageStory({
    fixture: inPounds,
    url: () => "/settings",
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await expect(canvas.getByText("Alice Example")).toBeVisible();
      await expect(
        canvas.getByText(/^Not synced yet\. \d+ changes/),
      ).toBeVisible();
      await expect(
        canvas.getByRole("button", { name: "Sync now" }),
      ).toBeVisible();
      await expect(canvas.queryByText("Clock ahead")).toBeNull();
    },
  }),
  beforeEach: signedIn(alice),
};

export const SignedInPc = {
  ...pageStory({ fixture: inPounds, url: () => "/settings", viewport: "pc" }),
  beforeEach: signedIn(alice),
};

/** The server refused changes stamped by a clock that ran ahead. */
export const ClockAhead = {
  ...pageStory({
    fixture: inPounds,
    url: () => "/settings",
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await expect(
        canvas.getByRole("button", { name: "Repair clock" }),
      ).toBeVisible();
    },
  }),
  beforeEach: signedIn(alice, { rejected: { future_clock: 3 } }),
};

/** The owner sees the server's backup layers; a stale one is called out. */
export const OwnerBackupsStale = {
  ...pageStory({
    fixture: empty,
    url: () => "/settings",
    theme: "dark",
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await expect(canvas.getByText("Server backups are stale")).toBeVisible();
      await expect(
        canvas.getByText(/Daily copy: never \(stale\)/),
      ).toBeVisible();
    },
  }),
  beforeEach: () => {
    const cleanup = signedIn({ ...alice, role: "owner" })();
    setOwnerStatusForStory({
      backupsOk: false,
      databaseBytes: 4_000_000,
      freeDiskBytes: 21_500_000_000,
      backups: {
        litestream: {
          configured: true,
          lastOkAt: Date.now() - 60_000,
          stale: false,
        },
        dailyCopy: {
          configured: true,
          lastOkAt: null,
          stale: true,
          lastError: "R2 down",
        },
      },
    });
    return cleanup;
  },
};

/** Signed in as an account other than the one this device's data is from. */
export const AccountChoice = {
  ...pageStory({
    fixture: empty,
    url: () => "/settings",
    play: async ({ canvasElement }) => {
      // Opened after the page renders: the modal hides the page's heading.
      setSyncStateForStory({ accountChoice: "u1" });
      const page = within(canvasElement.ownerDocument.body);
      const dialog = await page.findByRole("alertdialog", {
        name: "This device has another account's data",
      });
      await waitFor(() => expect(dialog).toBeVisible());
      await expect(page.getByRole("button", { name: "Merge" })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Discard this device's data" }),
      ).toBeVisible();
    },
  }),
  beforeEach: signedIn(alice),
};
