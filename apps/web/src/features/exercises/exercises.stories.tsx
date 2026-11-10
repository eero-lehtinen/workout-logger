import type { Meta } from "@storybook/react-vite";
import { exerciseId } from "@workout-logger/exercises";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { empty, withArchived } from "../../stories/fixtures.ts";
import { pageStory } from "../../stories/page.tsx";

export default {
  title: "Screens/Exercises",
} satisfies Meta;

export const Browser = pageStory({
  fixture: empty,
  url: () => "/exercises",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Legs" }));
    await expect(await canvas.findByText("Squat (Barbell)")).toBeVisible();
    await expect(canvas.queryByText("Bench Press (Barbell)")).toBeNull();
  },
});

export const ScrollKeptOnReturn = pageStory({
  fixture: empty,
  url: () => "/exercises",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = () =>
      canvasElement.ownerDocument.querySelector(
        '[data-scroll-restoration-id="exercises"]',
      );
    const main = list();
    if (!main) throw new Error("no scroll container");
    const squat = await canvas.findByRole("link", {
      name: /^Squat \(Barbell\)/,
    });
    squat.scrollIntoView({ block: "center" });
    // The router records scroll positions on a throttled scroll listener.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const scrolled = main.scrollTop;
    await expect(scrolled).toBeGreaterThan(0);
    await userEvent.click(squat);
    await canvas.findByRole("heading", { name: "Squat (Barbell)" });
    const history = canvasElement.ownerDocument.querySelector(
      '[data-scroll-restoration-id="exercise-history"]',
    );
    await expect(history?.scrollTop).toBe(0);
    await userEvent.click(
      canvas.getByRole("link", { name: "Back to exercises" }),
    );
    await canvas.findByRole("button", { name: "Core" });
    await waitFor(() => expect(list()?.scrollTop).toBe(scrolled));
  },
});

export const WithArchived = pageStory({
  fixture: withArchived,
  url: () => "/exercises",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Show 2 archived exercises" }),
    );
    await expect(
      await canvas.findByRole("heading", { name: "Archived" }),
    ).toBeVisible();
    await expect(canvas.getByText("Pec Deck (Old Gym)")).toBeVisible();
  },
});

export const CopyAsNew = pageStory({
  fixture: empty,
  url: () => `/exercises/${exerciseId("barbell_bench_press")}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("link", { name: "Copy as new" }),
    );
    await canvas.findByRole("heading", { name: "Copy exercise" });
    const name = canvas.getByRole("textbox", { name: "Name" });
    await expect(name).toHaveValue("Bench Press (Barbell) (copy)");
    const chest = within(canvas.getByRole("group", { name: "Chest" }));
    await expect(
      chest.getByRole("button", { name: "Primary" }),
    ).toHaveAttribute("aria-pressed", "true");

    await userEvent.clear(name);
    await userEvent.type(name, "Bench Press (Close Grip Pause)");
    await userEvent.click(
      canvas.getByRole("button", { name: "Create exercise" }),
    );

    const search = await canvas.findByRole("searchbox", {
      name: "Search exercises",
    });
    await userEvent.type(search, "bench press barbell");
    await expect(
      await canvas.findByText("Bench Press (Barbell)"),
    ).toBeVisible();
    await userEvent.clear(search);
    await userEvent.type(search, "close grip pause");
    await expect(
      await canvas.findByText("Bench Press (Close Grip Pause)"),
    ).toBeVisible();
  },
});

export const BrowserPc = pageStory({
  fixture: empty,
  url: () => "/exercises",
  viewport: "pc",
});

export const New = pageStory({
  fixture: empty,
  url: () => "/exercises/new",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const chest = within(await canvas.findByRole("group", { name: "Chest" }));
    const primary = chest.getByRole("button", { name: "Primary" });
    await userEvent.click(primary);
    await expect(primary).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(primary);
    await expect(primary).toHaveAttribute("aria-pressed", "false");
  },
});

export const EditBuiltIn = pageStory({
  fixture: empty,
  url: () => `/exercises/${exerciseId("barbell_bench_press")}`,
  viewport: "pc",
});
