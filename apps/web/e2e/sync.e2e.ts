import { expect, test } from "@playwright/test";
import { logSet, startWithExercise } from "./helpers.ts";
import { createSession, device } from "./server.ts";

test("two devices of one account see each other's sets", async ({
  browser,
}) => {
  const { token } = await createSession(`sync-${Date.now()}@example.com`);

  const phone = await device(browser, token, true);
  await startWithExercise(phone, "bench barbell", /^Barbell Bench Press/);
  await logSet(phone, "100", "8");
  await phone.goto("/settings");
  await expect(phone.getByText("Synced just now.")).toBeVisible({
    timeout: 15_000,
  });

  // A new device bootstraps from the server's snapshot.
  const pc = await device(browser, token, false);
  await pc.goto("/");
  await expect(pc.getByText(/Running since/)).toBeVisible({ timeout: 15_000 });
  await pc.getByRole("link", { name: /Running since/ }).click();
  await pc.getByRole("link", { name: /Barbell Bench Press/ }).click();
  await logSet(pc, "105", "6");

  await expect(async () => {
    await phone.goto("/");
    await phone.getByRole("link", { name: /Running since/ }).click();
    await phone.getByRole("link", { name: /Barbell Bench Press/ }).click();
    await expect(
      phone.getByRole("button", { name: /^Edit set 2: 105 × 6/ }),
    ).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
});
