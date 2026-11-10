import { join } from "node:path";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

/** Runs every story as a test in Chromium, with its play function and a11y checks. */
export default mergeConfig(
  viteConfig,
  defineConfig({
    plugins: [
      storybookTest({ configDir: join(import.meta.dirname, ".storybook") }),
    ],
    test: {
      name: "storybook",
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({}),
        instances: [{ browser: "chromium" }],
      },
    },
  }),
);
