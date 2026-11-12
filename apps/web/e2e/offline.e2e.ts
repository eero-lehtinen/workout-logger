import { expect, test } from "@playwright/test";
import { logSet, startWithExercise } from "./helpers.ts";

test("works offline after the first visit", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The service worker controls pages loaded after it activates.
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);

  await startWithExercise(page, "back squat", /^Back Squat/);
  await logSet(page, "140", "5");

  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Edit set 1:/ }),
  ).toBeVisible();
  await logSet(page, "140", "5");

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});
