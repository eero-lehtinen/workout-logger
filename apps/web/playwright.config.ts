import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Not the default preview port, so a preview left running is never mistaken for the build under test.
const PORT = 4317;

// A fresh server database per run. Workers inherit the runner's environment,
// so the sync test opens the same file to create its session.
process.env.E2E_DATABASE_PATH ??= join(
  tmpdir(),
  "workout-logger-e2e",
  `${Date.now()}.db`,
);

/**
 * End-to-end tests of what only the real app shell shows: OPFS persistence,
 * Web Lock tab ownership, the DB worker, and the service worker. They run
 * against the production build, which is the only one with a service worker,
 * served by the production server, so its caching headers are tested too.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // The tests check English text; otherwise the browser takes the
    // machine's language and the app follows it.
    locale: "en-US",
  },
  projects: [{ name: "phone", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "pnpm build && pnpm --filter @workout-logger/server start",
    env: { PORT: String(PORT), DATABASE_PATH: process.env.E2E_DATABASE_PATH },
    url: `http://localhost:${PORT}/api/status`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
