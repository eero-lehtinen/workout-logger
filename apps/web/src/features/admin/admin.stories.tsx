import type { Meta } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { type AccountUser, setAccountForStory } from "../../lib/account.ts";
import type { AdminUser, AdminUsers } from "../../lib/admin-api.ts";
import { setOwnerStatusForStory } from "../../lib/server-status.ts";
import { empty } from "../../stories/fixtures.ts";
import { pageStory } from "../../stories/page.tsx";

export default {
  title: "Screens/Admin",
} satisfies Meta;

const MB = 1024 * 1024;
const NOW = Date.now();

const owner: AccountUser = {
  id: "owner",
  name: "Owner",
  email: "owner@example.com",
  image: null,
  role: "owner",
};

function user(overrides: Partial<AdminUser>): AdminUser {
  return {
    id: "u1",
    name: "Alice Example",
    email: "alice@example.com",
    role: "user",
    createdAt: NOW - 40 * 24 * 60 * 60 * 1000,
    disabled: false,
    lastSyncAt: NOW - 5 * 60 * 1000,
    bytesWrittenToday: 120 * 1024,
    storedBytes: 1.8 * MB,
    overrides: {
      bytesPerDay: null,
      maxBytes: null,
      requestsPerMinute: null,
      snapshotsPerDay: null,
    },
    exemptUntil: null,
    ...overrides,
  };
}

const users: AdminUsers = {
  users: [
    user({
      id: "owner",
      name: "Owner",
      email: "owner@example.com",
      role: "owner",
      storedBytes: 2.9 * MB,
    }),
    user({}),
    user({
      id: "u2",
      name: "Bob Example",
      email: "bob@example.com",
      disabled: true,
      lastSyncAt: null,
      bytesWrittenToday: 0,
      storedBytes: 0,
      overrides: {
        bytesPerDay: 1 * MB,
        maxBytes: 20 * MB,
        requestsPerMinute: null,
        snapshotsPerDay: null,
      },
    }),
  ],
  defaults: {
    bytesPerDay: 5 * MB,
    maxBytes: 10 * MB,
    requestsPerMinute: 60,
    snapshotsPerDay: 10,
  },
  maxAccounts: null,
  defaultMaxAccounts: 100,
};

const realFetch = globalThis.fetch;
const requests = fn();

/** The owner, with the server answering `/api/admin/*` from `users`. */
function asOwner(databaseBytes = 40 * MB) {
  return () => {
    requests.mockClear();
    setAccountForStory({ status: "signed-in", user: owner, offline: false });
    setOwnerStatusForStory({
      backupsOk: true,
      databaseBytes,
      freeDiskBytes: 20e9,
      backups: {
        litestream: { configured: true, lastOkAt: NOW, stale: false },
        dailyCopy: { configured: true, lastOkAt: NOW, stale: false },
      },
    });
    globalThis.fetch = fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests(init?.method ?? "GET", url, init?.body ?? null);
        if (url.endsWith("/api/admin/users")) return Response.json(users);
        if (url.includes("/api/admin/"))
          return new Response(null, { status: 204 });
        return new Response(null, { status: 404 });
      },
    );
    return () => {
      globalThis.fetch = realFetch;
      setAccountForStory({ status: "unknown" });
      setOwnerStatusForStory(null);
    };
  };
}

/** Every account with its usage against its limits. */
export const Users = {
  ...pageStory({
    fixture: empty,
    url: () => "/admin",
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await expect(await canvas.findByText("Alice Example")).toBeVisible();
      await expect(
        canvas.getByText(/^1\.8 MB of 10 MB stored · 120 kB of 5 MB today/),
      ).toBeVisible();
      await expect(canvas.getByText(/· disabled/)).toBeVisible();
      await expect(
        canvas.getByText(
          /^0 B of 20 MB stored · 0 B of 1 MB today · never synced$/,
        ),
      ).toBeVisible();
      await expect(canvas.getByText("Server database 40 MB")).toBeVisible();
    },
  }),
  beforeEach: asOwner(),
};

export const UsersPc = {
  ...pageStory({ fixture: empty, url: () => "/admin", viewport: "pc" }),
  beforeEach: asOwner(),
};

/** Over 700 MB, R2's free tier is close. */
export const DatabaseLarge = {
  ...pageStory({
    fixture: empty,
    url: () => "/admin",
    theme: "dark",
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await expect(
        await canvas.findByText(/^The server database is over 700 MB,/),
      ).toBeVisible();
    },
  }),
  beforeEach: asOwner(720 * MB),
};

/** Overrides are entered in MB; an empty field is the default. */
export const EditQuotas = {
  ...pageStory({
    fixture: empty,
    url: () => "/admin",
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await userEvent.click(
        await canvas.findByRole("button", { name: /^Alice Example/ }),
      );
      const page = within(canvasElement.ownerDocument.body);
      const dialog = await page.findByRole("dialog", { name: "Alice Example" });
      const sheet = within(dialog);
      await userEvent.type(sheet.getByLabelText("Storage (MB)"), "25");
      await userEvent.click(sheet.getByRole("button", { name: "Save quotas" }));
      await waitFor(() =>
        expect(requests).toHaveBeenCalledWith(
          "PUT",
          "/api/admin/users/u1/quota",
          JSON.stringify({
            bytesPerDay: null,
            maxBytes: 25 * MB,
            requestsPerMinute: null,
            snapshotsPerDay: null,
          }),
        ),
      );
      await userEvent.click(
        sheet.getByRole("button", { name: "Allow for 24 h" }),
      );
      await waitFor(() =>
        expect(requests).toHaveBeenCalledWith(
          "POST",
          "/api/admin/users/u1/exempt",
          null,
        ),
      );
    },
  }),
  beforeEach: asOwner(),
};

/** The cap shows next to the account count; empty is the default. */
export const AccountCap = {
  ...pageStory({
    fixture: empty,
    url: () => "/admin",
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await expect(
        await canvas.findByText(/^3 of 100 accounts, you included\./),
      ).toBeVisible();
      await userEvent.type(canvas.getByLabelText("Account cap"), "20");
      await userEvent.click(canvas.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(requests).toHaveBeenCalledWith(
          "PUT",
          "/api/admin/limits",
          JSON.stringify({ maxAccounts: 20 }),
        ),
      );
    },
  }),
  beforeEach: asOwner(),
};

/** Disabling asks first. */
export const Disable = {
  ...pageStory({
    fixture: empty,
    url: () => "/admin",
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await userEvent.click(
        await canvas.findByRole("button", { name: /^Alice Example/ }),
      );
      const page = within(canvasElement.ownerDocument.body);
      await userEvent.click(
        await page.findByRole("button", { name: "Disable" }),
      );
      const confirm = await page.findByRole("alertdialog", {
        name: "Disable Alice Example?",
      });
      await userEvent.click(
        within(confirm).getByRole("button", { name: "Disable" }),
      );
      await waitFor(() =>
        expect(requests).toHaveBeenCalledWith(
          "POST",
          "/api/admin/users/u1/disable",
          null,
        ),
      );
    },
  }),
  beforeEach: asOwner(),
};
