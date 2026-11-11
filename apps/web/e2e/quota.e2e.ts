import { expect, test } from "@playwright/test";
import { createSession, device, withServerDb } from "./server.ts";

const DAY = 24 * 60 * 60 * 1000;

test("sync pauses at the daily limit and resumes after an exemption", async ({
  browser,
}) => {
  const { token, userId } = await createSession(
    `quota-${Date.now()}@example.com`,
  );
  // Past the 24 h after sign-up, with no upload allowed today.
  await withServerDb(async (db) => {
    await db
      .updateTable("user")
      .set({ createdAt: new Date(Date.now() - 2 * DAY).toISOString() })
      .where("id", "=", userId)
      .execute();
    await db
      .insertInto("quota")
      .values({ user_id: userId, bytes_per_day: 0 })
      .execute();
  });

  const phone = await device(browser, token, true);
  await phone.goto("/settings");
  await expect(
    phone.getByText(/^Sync paused: today's upload limit is reached\./),
  ).toBeVisible({ timeout: 15_000 });

  await withServerDb((db) =>
    db
      .updateTable("quota")
      .set({ exempt_until: Date.now() + DAY })
      .where("user_id", "=", userId)
      .execute(),
  );
  await phone.getByRole("button", { name: "Sync now" }).click();
  await expect(phone.getByText(/^Synced just now\.$/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(phone.getByText(/no limit for now/)).toBeVisible();
});
