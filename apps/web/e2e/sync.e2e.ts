import { type Browser, devices, expect, test } from "@playwright/test";
import { readConfig } from "../../server/src/config.ts";
import { openServer } from "../../server/src/startup.ts";
import { logSet, startWithExercise } from "./helpers.ts";

/**
 * A signed-in user without GitHub: the user and session go straight into the
 * server's database, and the browser sends the session token as a bearer
 * token, which the server accepts like its cookie.
 */
async function createSession(email: string): Promise<string> {
  const { database, auth } = await openServer(
    readConfig({ DATABASE_PATH: process.env.E2E_DATABASE_PATH }),
  );
  try {
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.createUser(
      { email, name: "E2E", emailVerified: true },
      { method: "admin" },
    );
    return (await ctx.internalAdapter.createSession(user.id)).token;
  } finally {
    await database.close();
  }
}

async function device(browser: Browser, token: string, phone: boolean) {
  const context = await browser.newContext({
    ...(phone ? devices["Pixel 7"] : {}),
    // browser.newContext doesn't apply the config's `use`.
    baseURL: test.info().project.use.baseURL as string,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  return context.newPage();
}

test("two devices of one account see each other's sets", async ({
  browser,
}) => {
  const token = await createSession(`sync-${Date.now()}@example.com`);

  const phone = await device(browser, token, true);
  await startWithExercise(phone, "bench barbell", /^Bench Press \(Barbell\)/);
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
  await pc.getByRole("link", { name: /Bench Press \(Barbell\)/ }).click();
  await logSet(pc, "105", "6");

  await expect(async () => {
    await phone.goto("/");
    await phone.getByRole("link", { name: /Running since/ }).click();
    await phone.getByRole("link", { name: /Bench Press \(Barbell\)/ }).click();
    await expect(
      phone.getByRole("button", { name: /^Edit set 2: 105 × 6/ }),
    ).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
});
