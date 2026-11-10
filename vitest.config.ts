import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/*",
      "apps/*",
      // Stories run in a real browser; see apps/web/vitest.storybook.config.ts.
      "apps/web/vitest.storybook.config.ts",
    ],
  },
});
