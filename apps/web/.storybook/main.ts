import { defineMain } from "@storybook/react-vite/node";
import type { PluginOption } from "vite";

/** Storybook needs the PWA plugin's virtual modules, not a service worker. */
function withoutServiceWorker(plugins: PluginOption[]): PluginOption[] {
  return plugins.flatMap((plugin) =>
    Array.isArray(plugin)
      ? [withoutServiceWorker(plugin)]
      : plugin && "name" in plugin && plugin.name === "vite-plugin-pwa:build"
        ? []
        : [plugin],
  );
}

export default defineMain({
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-vitest"],
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
  features: {
    sidebarOnboardingChecklist: false,
    menuOnboardingChecklist: false,
  },
  viteFinal: (config) => ({
    ...config,
    define: {
      ...config.define,
      // What CI's image build gets from repository variables.
      "import.meta.env.CONTACT_NAME": JSON.stringify("Alex Example"),
      "import.meta.env.CONTACT_EMAIL": JSON.stringify("privacy@example.com"),
    },
    plugins: withoutServiceWorker(config.plugins ?? []),
  }),
});
