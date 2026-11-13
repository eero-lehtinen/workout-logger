import type { Meta } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { type AccountUser, setAccountForStory } from "../../lib/account.ts";
import type {
  AdminUser,
  AdminUsers,
  BackupStorage,
} from "../../lib/admin-api.ts";
import {
  type OwnerStatus,
  setOwnerStatusForStory,
} from "../../lib/server-status.ts";
import { STORY_NOW as NOW } from "../../stories/clock.ts";
import { empty } from "../../stories/fixtures.ts";
import { pageStory } from "../../stories/page.tsx";

export default {
  title: "Screens/Admin",
} satisfies Meta;

const MB = 1024 * 1024;

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

const MALFORMED_COPY =
  "daily/2026-11-12.db.br: integrity check: database disk image is malformed";

const healthy: OwnerStatus = {
  backupsOk: true,
  databaseBytes: 40 * MB,
  freeDiskBytes: 20 * 1024 * MB,
  backups: {
    litestream: { configured: true, lastOkAt: NOW - 30_000, stale: false },
    dailyCopy: {
      configured: true,
      lastOkAt: NOW - 5 * 60 * 60 * 1000,
      stale: false,
      lastError: null,
    },
    copyRehearsal: {
      configured: true,
      lastOkAt: NOW - 4 * 60 * 60 * 1000,
      stale: false,
      lastError: null,
      failed: false,
    },
    replicaRehearsal: {
      configured: true,
      lastOkAt: NOW - 3 * 60 * 60 * 1000,
      stale: false,
      lastError: null,
      failed: false,
    },
    tokenCheck: {
      configured: true,
      lastOkAt: NOW - 2 * 60 * 60 * 1000,
      stale: false,
      lastError: null,
      failed: false,
    },
  },
};

const storage: BackupStorage = {
  bytes: 330 * MB,
  objects: 11,
  groups: [
    { prefix: "daily", bytes: 210 * MB, objects: 7 },
    { prefix: "monthly", bytes: 90 * MB, objects: 3 },
    { prefix: "pre-migration", bytes: 30 * MB, objects: 1 },
  ],
};

/**
 * The owner, with the server answering `/api/admin/*` from `users` and
 * `storage`; a null `storage` makes the bucket listing fail.
 */
function asOwner(
  status: OwnerStatus = healthy,
  backupStorage: BackupStorage | null = storage,
) {
  return () => {
    requests.mockClear();
    setAccountForStory({ status: "signed-in", user: owner, offline: false });
    setOwnerStatusForStory(status);
    globalThis.fetch = fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests(init?.method ?? "GET", url, init?.body ?? null);
        if (url.endsWith("/api/admin/users")) return Response.json(users);
        if (url.endsWith("/api/admin/backup-storage")) {
          return backupStorage
            ? Response.json(backupStorage)
            : Response.json(
                { error: "backup_listing_failed" },
                { status: 502 },
              );
        }
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

/** The server's storage and backups, then every account with its usage. */
export const Overview = {
  ...pageStory({
    fixture: empty,
    url: () => "/admin",
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await expect(await canvas.findByText("Alice Example")).toBeVisible();
      await expect(
        canvas.getByRole("heading", { name: "Admin" }),
      ).toBeVisible();
      await expect(canvas.getByText("40 MB")).toBeVisible();
      await expect(canvas.getByText("20 GB")).toBeVisible();
      await expect(canvas.getByText("just now")).toBeVisible();
      await expect(canvas.getByText("5 hours ago")).toBeVisible();
      await expect(canvas.getByText("4 hours ago")).toBeVisible();
      await expect(canvas.getByText("3 hours ago")).toBeVisible();
      await expect(canvas.getByText("2 hours ago")).toBeVisible();
      await expect(await canvas.findByText("330 MB")).toBeVisible();
      await expect(
        canvas.getByText(
          /: 7 daily \(210 MB\), 3 monthly \(90 MB\), 1 pre-migration \(30 MB\)\./,
        ),
      ).toBeVisible();
      await expect(
        canvas.getByText(
          /^1\.8 MB of 10 MB stored · 120 kB of 5 MB uploaded today/,
        ),
      ).toBeVisible();
      await expect(canvas.getByText(/· disabled/)).toBeVisible();
      await expect(
        canvas.getByText(
          /^0 B of 20 MB stored · 0 B of 1 MB uploaded today · never synced$/,
        ),
      ).toBeVisible();
    },
  }),
  beforeEach: asOwner(),
};

export const Finnish = {
  ...pageStory({
    fixture: empty,
    url: () => "/admin",
    language: "fi",
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await expect(await canvas.findByText("Alice Example")).toBeVisible();
      await expect(
        canvas.getByRole("heading", { name: "Ylläpito" }),
      ).toBeVisible();
      await expect(canvas.getByText(/· poistettu käytöstä/)).toBeVisible();
      await expect(canvas.getByText(/ei koskaan synkronoitu$/)).toBeVisible();
    },
  }),
  beforeEach: asOwner(),
};

export const OverviewPc = {
  ...pageStory({ fixture: empty, url: () => "/admin", viewport: "pc" }),
  beforeEach: asOwner(),
};

/**
 * A stale layer and the job's last error, and a failed restore test; over
 * 700 MB, R2's free tier is close. The bucket can't be listed.
 */
export const ServerTrouble = {
  ...pageStory({
    fixture: empty,
    url: () => "/admin",
    theme: "dark",
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      await expect(await canvas.findByText(/^Over 700 MB,/)).toBeVisible();
      await expect(canvas.getByText("Stale · 3 days ago")).toBeVisible();
      await expect(canvas.getByText("Last run failed: R2 down")).toBeVisible();
      await expect(canvas.getByText("Failed")).toBeVisible();
      await expect(
        canvas.getByText(`Last run failed: ${MALFORMED_COPY}`),
      ).toBeVisible();
      await expect(
        await canvas.findByText(
          "Couldn't list the bucket: The server answered 502",
        ),
      ).toBeVisible();
      await expect(canvas.getByText("Unknown")).toBeVisible();
    },
  }),
  beforeEach: asOwner(
    {
      ...healthy,
      backupsOk: false,
      databaseBytes: 720 * MB,
      backups: {
        ...healthy.backups,
        dailyCopy: {
          configured: true,
          lastOkAt: NOW - 3 * 24 * 60 * 60 * 1000,
          stale: true,
          lastError: "R2 down",
        },
        copyRehearsal: {
          configured: true,
          lastOkAt: NOW - 28 * 60 * 60 * 1000,
          stale: false,
          lastError: MALFORMED_COPY,
          failed: true,
        },
      },
    },
    null,
  ),
};

/**
 * Overrides are entered in MB; an empty field is the default. Disabling asks
 * first.
 */
export const EditAccount = {
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
        sheet.getByRole("button", { name: "Lift limit for 24 h" }),
      );
      await waitFor(() =>
        expect(requests).toHaveBeenCalledWith(
          "POST",
          "/api/admin/users/u1/exempt",
          null,
        ),
      );

      await userEvent.click(sheet.getByRole("button", { name: "Disable" }));
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

/** Search matches every word against name and email, in any order. */
export const Search = {
  ...pageStory({
    fixture: empty,
    url: () => "/admin",
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const search = await canvas.findByRole("searchbox", {
        name: "Search accounts",
      });
      await canvas.findByText("Alice Example");
      await userEvent.type(search, "example.com bob");
      await waitFor(() =>
        expect(canvas.queryByText("Alice Example")).toBeNull(),
      );
      await expect(canvas.getByText("Bob Example")).toBeVisible();
      await userEvent.clear(search);
      await userEvent.type(search, "nobody");
      await expect(
        await canvas.findByText("No account matches."),
      ).toBeVisible();
    },
  }),
  beforeEach: asOwner(),
};
