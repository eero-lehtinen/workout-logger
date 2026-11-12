import { expect, test } from "@playwright/test";
import { logSet, startWithExercise } from "./helpers.ts";

test("logged sets survive a reload, and a delete can be undone", async ({
  page,
}) => {
  await startWithExercise(page, "bench barbell", /^Barbell Bench Press/);
  await logSet(page, "100", "8");
  await logSet(page, "102.5", "8");
  await expect(page.getByText(/^Rest/).first()).toBeVisible();

  await page.getByRole("button", { name: /^Edit set 2:/ }).click();
  await page.getByRole("button", { name: "Delete set" }).click();
  await expect(page.getByRole("button", { name: /^Edit set 2:/ })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByRole("button", { name: /^Edit set 2:/ }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Edit set 1: 100 × 8/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Edit set 2: 102.5 × 8/ }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Back to session" }).click();
  await page.getByRole("link", { name: "Back to today" }).click();
  await expect(page.getByText(/Running since/)).toBeVisible();
});
