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
