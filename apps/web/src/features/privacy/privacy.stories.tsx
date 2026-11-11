import type { Meta } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { empty } from "../../stories/fixtures.ts";
import { pageStory } from "../../stories/page.tsx";

export default {
  title: "Screens/Privacy",
} satisfies Meta;

/** The notice the sign-in row and Google's consent screen link to. */
export const Phone = pageStory({
  fixture: empty,
  url: () => "/privacy",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/the owner can technically read it/),
    ).toBeVisible();
    await expect(canvas.getByText("Monthly copies: 3 months")).toBeVisible();
  },
});

export const Pc = pageStory({
  fixture: empty,
  url: () => "/privacy",
  viewport: "pc",
  theme: "dark",
});
