import { expect, test } from "@playwright/test";

test("one tab owns the database; another can take it and give it back", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

  const second = await context.newPage();
  await second.goto("/");
  await expect(second.getByText("Open in another tab")).toBeVisible();

  await second.getByRole("button", { name: "Use here" }).click();
  await expect(second.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByText("Open in another tab")).toBeVisible();

  // Closing the owner releases the lock, and the waiting tab takes over.
  await second.close();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
});

// Headless Chromium doesn't freeze pages (CDP's Page.setWebLifecycleState
// leaves timers running and fires no events), so these tests dispatch the
// lifecycle events or stall the main thread instead.

test("a tab lets go of the database when the browser freezes it", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.getByText("Open in another tab")).toBeVisible();

  await page.evaluate(() => document.dispatchEvent(new Event("freeze")));
  await expect(second.getByRole("heading", { name: "Today" })).toBeVisible();

  await page.evaluate(() => document.dispatchEvent(new Event("resume")));
  await expect(page.getByText("Open in another tab")).toBeVisible();
});

test("a resume without a freeze keeps the database", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

  await page.evaluate(() => document.dispatchEvent(new Event("resume")));
  // Asking for the lock it already holds would show "Open in another tab".
  await page.getByRole("link", { name: "Settings" }).first().click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Open in another tab")).toBeHidden();
});
test("taking over from a tab that can't let go waits for it", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.getByText("Open in another tab")).toBeVisible();

  // Like a frozen tab: its worker holds the files, but its own code can't
  // run to see the steal.
  const stalled = page.evaluate(() => {
    const end = Date.now() + 6000;
    while (Date.now() < end);
  });
  await second.getByRole("button", { name: "Use here" }).click();
  await expect(second.getByText("Still open in another window")).toBeVisible();

  await stalled;
  await expect(second.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByText("Open in another tab")).toBeVisible();
});
