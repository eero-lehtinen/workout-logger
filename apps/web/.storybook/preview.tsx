import type { Preview } from "@storybook/react-vite";
import { configure } from "storybook/test";
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
  },
  globalTypes: {
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
