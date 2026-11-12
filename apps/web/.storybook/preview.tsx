import type { Preview } from "@storybook/react-vite";
import { configure } from "storybook/test";
import { type Language, pinLanguage } from "../src/i18n/index.ts";
import { resetStoryClock } from "../src/stories/clock.ts";
import "../src/styles.css";

// The first navigation to a route makes Vite transform its lazily split
// chunk, which on a cold CI runner takes longer than the default 1 s.
configure({ asyncUtilTimeout: 5_000 });

const preview: Preview = {
  // Runs before each story's own loaders, which build its fixture.
  loaders: [resetStoryClock],
  parameters: {
    layout: "fullscreen",
    // Accessibility violations fail the story's test.
    a11y: { test: "error" },
    viewport: {
      options: {
        phone: {
          name: "Phone",
          styles: { width: "390px", height: "844px" },
          type: "mobile",
        },
        // The narrowest width layouts must fit (WCAG reflow), reached by
        // Android phones with a larger display size setting.
        phoneNarrow: {
          name: "Narrow phone",
          styles: { width: "320px", height: "700px" },
          type: "mobile",
        },
        pc: {
          name: "PC",
          styles: { width: "1366px", height: "860px" },
          type: "desktop",
        },
      },
    },
  },
  initialGlobals: {
    viewport: { value: "phone", isRotated: false },
    theme: "light",
    // Fixed, so stories don't follow the language of the machine running them.
    language: "en",
  },
  globalTypes: {
    language: {
      description: "UI language",
      toolbar: {
        title: "Language",
        icon: "globe",
        items: [
          { value: "en", title: "English" },
          { value: "fi", title: "Suomi" },
        ],
        dynamicTitle: true,
      },
    },
    theme: {
      description: "Color theme",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      document.documentElement.dataset.theme = context.globals.theme as string;
      pinLanguage(context.globals.language as Language);
      // The app's root is isolated the same way (styles.css, #app).
      return (
        <div className="isolate">
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
