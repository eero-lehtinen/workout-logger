import { defineConfig, devices } from "@playwright/test";

// Not the default preview port, so a preview left running is never mistaken for the build under test.
const PORT = 4317;

/**
 * End-to-end tests of what only the real app shell shows: OPFS persistence,
 * Web Lock tab ownership, the DB worker, and the service worker. They run
 * against the production build, which is the only one with a service worker.
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
  },
  projects: [{ name: "phone", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
