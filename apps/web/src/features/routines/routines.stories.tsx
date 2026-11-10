import type { Meta } from "@storybook/react-vite";
import { empty, withRoutine } from "../../stories/fixtures.ts";
import { pageStory } from "../../stories/page.tsx";

export default {
  title: "Screens/Routines",
} satisfies Meta;

export const ListEmpty = pageStory({ fixture: empty, url: () => "/routines" });

export const List = pageStory({ fixture: withRoutine, url: () => "/routines" });

export const Editor = pageStory({
  fixture: withRoutine,
  url: (ids) => `/routines/${ids.routineId}`,
});

export const EditorPc = pageStory({
  fixture: withRoutine,
  url: (ids) => `/routines/${ids.routineId}`,
  viewport: "pc",
});
