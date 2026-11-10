import { expect, type Page } from "@playwright/test";

/** Starts an ad hoc session and opens the logging view of one exercise. */
export async function startWithExercise(
  page: Page,
  search: string,
  name: RegExp,
) {
  await page.goto("/");
  await page.getByRole("link", { name: "Start session" }).click();
  await page.getByRole("button", { name: "Ad hoc session" }).click();
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByRole("searchbox", { name: "Search exercises" }).fill(search);
  await page.getByRole("button", { name }).first().click();
  await expect(page.getByRole("button", { name: "Log set 1" })).toBeVisible();
}

export async function logSet(page: Page, weight: string, reps: string) {
  const next = page.getByRole("button", { name: /^Log set \d+$/ });
  const label = (await next.textContent()) ?? "";
  await page.getByLabel("Weight in kg", { exact: true }).fill(weight);
  await page.getByLabel("Reps", { exact: true }).fill(reps);
  await next.click();
  const n = label.replace("Log set ", "");
  await expect(
    page.getByRole("button", { name: new RegExp(`^Edit set ${n}:`) }),
  ).toBeVisible();
}
