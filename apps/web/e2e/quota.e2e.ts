import { expect, test } from "@playwright/test";
import { createSession, device, withServerDb } from "./server.ts";

test("sync pauses at the daily limit and resumes when it is raised", async ({
  browser,
}) => {
  const { token, userId } = await createSession(
    `quota-${Date.now()}@example.com`,
  );
  await withServerDb((db) =>
    db
      .insertInto("quota")
      .values({ user_id: userId, bytes_per_day: 0 })
      .execute(),
  );

  const phone = await device(browser, token, true);
  await phone.goto("/settings");
  await expect(
    phone.getByText(/^Sync paused: today's upload limit is reached\./),
  ).toBeVisible({ timeout: 15_000 });

  await withServerDb((db) =>
    db
      .updateTable("quota")
      .set({ bytes_per_day: null })
      .where("user_id", "=", userId)
      .execute(),
  );
  await phone.getByRole("button", { name: "Sync now" }).click();
  await expect(phone.getByText(/^Synced just now\.$/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    phone.getByText(/^Uploaded today: .+ of 20 MB\.$/),
  ).toBeVisible();
});
