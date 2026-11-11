import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { ownServer } from "./server.ts";

/** A deploy whose only change is a marker in index.html. */
async function deploy(webRoot: string) {
  const index = join(webRoot, "index.html");
  const html = await readFile(index, "utf8");
  await writeFile(
    index,
    html.replace("<head>", '<head><meta name="e2e-build" content="next">'),
  );
  const sw = join(webRoot, "sw.js");
  const script = await readFile(sw, "utf8");
  const next = script.replace(
    /(url:"index\.html",revision:")[^"]+/,
    "$1e2e-next",
  );
  expect(next).not.toBe(script);
  await writeFile(sw, next);
}

// Both fail while the app reloads itself into the next version.

function shownBuild(page: Page) {
  return page
    .evaluate(
      () =>
        document
          .querySelector('meta[name="e2e-build"]')
          ?.getAttribute("content") ?? "first",
    )
    .catch(() => "reloading");
}

function hasWaitingVersion(page: Page) {
  return page
    .evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return Boolean(registration?.waiting);
    })
    .catch(() => false);
}

test("a reload shows a version found earlier", async ({ page }) => {
  // The deploy changes files that the shared server's other tests use.
  const server = await ownServer();
  try {
    await page.goto(server.url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      )
      .toBe(true);

    await deploy(server.webRoot);

    // This load finds the deploy. Whether it installs before the app
    // registers is a race, so it may already be shown.
    await page.reload();
    await expect
      .poll(
        async () =>
          (await hasWaitingVersion(page)) ||
          (await shownBuild(page)) === "next",
      )
      .toBe(true);

    await page.reload();
    await expect.poll(() => shownBuild(page)).toBe("next");
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  } finally {
    await server.close();
  }
});
