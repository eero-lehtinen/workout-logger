import type { Meta } from "@storybook/react-vite";
import { exerciseId } from "@workout-logger/exercises";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  empty,
  running,
  withArchived,
  withHistory,
} from "../../stories/fixtures.ts";
import { pageStory } from "../../stories/page.tsx";
import { choose } from "../../stories/select.ts";

export default {
  title: "Screens/Exercises",
} satisfies Meta;

export const Browser = pageStory({
  fixture: empty,
  url: () => "/exercises",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Legs" }));
    await expect(await canvas.findByText("Back Squat")).toBeVisible();
    await expect(canvas.queryByText("Barbell Bench Press")).toBeNull();
  },
});

export const BrowserFinnish = pageStory({
  fixture: empty,
  url: () => "/exercises",
  language: "fi",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("searchbox", { name: "Hae liikkeitä" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Rinta" }));
    await expect(await canvas.findByText("Barbell Bench Press")).toBeVisible();
    await expect(canvas.queryByText("Back Squat")).toBeNull();
  },
});

/**
 * A logged exercise shows its best set by e1RM and how many sets it has.
 * Recent puts the exercise of the last logged set first.
 */
export const LoggedStats = pageStory({
  fixture: withHistory,
  url: () => "/exercises",
  play: async ({ canvasElement }) => {
    const squat = await within(canvasElement).findByRole("link", {
      name: /^Back Squat/,
    });
    await expect(squat).toHaveTextContent(/125 kg × 6\s*9 sets$/);

    await choose(canvasElement, "Sort exercises", "Recent");
    // The last set of the latest session was a leg curl.
    const first = canvasElement.querySelector(
      'a[href*="/exercises/"][href$="/history"]',
    );
    await expect(first).toHaveTextContent(/^Lying Leg Curl/);
  },
});

/**
 * A substitution lists the slot's alternatives, then exercises sharing a
 * primary muscle, then the rest, each in the chosen order.
 */
export const SubstitutionSections = pageStory({
  fixture: running,
  url: (ids) => `/sessions/${ids.sessionId}/${ids.benchId}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "More actions" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Substitute" }),
    );
    const sheet = await body.findByRole("dialog");
    const section = (title: string) =>
      within(
        within(sheet).getByRole("heading", { name: title })
          .parentElement as HTMLElement,
      )
        .getAllByRole("button")
        .map((b) => b.textContent ?? "");
    await within(sheet).findByRole("heading", { name: "Alternatives" });
    await expect(section("Alternatives")[0]).toMatch(/^Dumbbell Bench Press/);
    const names = section("Same muscles");
    await expect(names.length).toBeGreaterThan(1);
    await expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    await expect(
      within(sheet).getByRole("heading", { name: "All exercises" }),
    ).toBeVisible();
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
    const calfRaise = await canvas.findByRole("link", {
      name: /^Standing Calf Raise/,
    });
    calfRaise.scrollIntoView({ block: "center" });
    // The router records scroll positions on a throttled scroll listener.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const scrolled = main.scrollTop;
    await expect(scrolled).toBeGreaterThan(0);
    await userEvent.click(calfRaise);
    await canvas.findByRole("heading", { name: "Standing Calf Raise" });
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
    await expect(canvas.getByText("Old Gym Pec Deck")).toBeVisible();
  },
});

export const CopyAsNew = pageStory({
  fixture: empty,
  url: () => `/exercises/${exerciseId("barbell_bench_press")}`,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "More actions" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Copy as new" }),
    );
    await canvas.findByRole("heading", { name: "Copy exercise" });
    const name = canvas.getByRole("textbox", { name: "Name" });
    await expect(name).toHaveValue("Barbell Bench Press (copy)");
    const chest = within(canvas.getByRole("group", { name: "Chest" }));
    await expect(chest.getByRole("button", { name: "Chest" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.clear(name);
    await userEvent.type(name, "Close-Grip Pause Bench Press");
    await userEvent.click(
      canvas.getByRole("button", { name: "Create exercise" }),
    );

    const search = await canvas.findByRole("searchbox", {
      name: "Search exercises",
    });
    await userEvent.type(search, "bench press barbell");
    await expect(await canvas.findByText("Barbell Bench Press")).toBeVisible();
    await userEvent.clear(search);
    await userEvent.type(search, "close grip pause");
    await expect(
      await canvas.findByText("Close-Grip Pause Bench Press"),
    ).toBeVisible();
  },
});

/** Both columns keep the same width whatever names they hold. */
export const BrowserPc = pageStory({
  fixture: empty,
  url: () => "/exercises",
  viewport: "pc",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rowWidths = () =>
      new Set(
        [
          ...canvasElement.querySelectorAll("li:has(> a[href$='/history'])"),
        ].map((li) => Math.round(li.getBoundingClientRect().width)),
      );
    await canvas.findByText("Back Squat");
    await expect(rowWidths().size).toBe(1);
    for (const group of ["Legs", "Chest", "Core"]) {
      await userEvent.click(canvas.getByRole("button", { name: group }));
      await expect(rowWidths().size).toBe(1);
    }
  },
});

/** Nothing is red before a save was tried. */
export const NewUntouched = pageStory({
  fixture: empty,
  url: () => "/exercises/new",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/Pick at least one primary\.$/),
    ).not.toHaveClass("text-danger");
    await expect(canvas.getByRole("textbox", { name: "Name" })).toHaveAttribute(
      "aria-invalid",
      "false",
    );
  },
});

/**
 * A muscle chip steps through primary, secondary, and none. What's missing
 * turns red only once a save was tried.
 */
export const New = pageStory({
  fixture: empty,
  url: () => "/exercises/new",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const hint = await canvas.findByText(/Pick at least one primary\.$/);
    await expect(hint).not.toHaveClass("text-danger");
    await userEvent.click(
      canvas.getByRole("button", { name: "Create exercise" }),
    );
    await expect(hint).toHaveClass("text-danger");
    await expect(canvas.getByText("Enter a name.")).toBeVisible();

    const chest = within(
      canvas.getByRole("group", { name: "Chest" }),
    ).getByRole("button", { name: "Chest" });
    await userEvent.click(chest);
    await expect(chest).toHaveAttribute("aria-pressed", "true");
    await expect(hint).not.toHaveClass("text-danger");
    await userEvent.click(chest);
    await expect(chest).toHaveAttribute("aria-pressed", "mixed");
    await expect(hint).toHaveClass("text-danger");
    await userEvent.click(chest);
    await expect(chest).toHaveAttribute("aria-pressed", "false");
  },
});

export const EditBuiltIn = pageStory({
  fixture: empty,
  url: () => `/exercises/${exerciseId("barbell_bench_press")}`,
  viewport: "pc",
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/^Built-in exercise\./),
    ).toBeVisible();
  },
});

export const EditFinnish = pageStory({
  fixture: empty,
  url: () => `/exercises/${exerciseId("barbell_bench_press")}`,
  language: "fi",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("heading", { name: "Muokkaa liikettä" }),
    ).toBeVisible();
    const chest = within(canvas.getByRole("group", { name: "Rinta" }));
    await expect(chest.getByRole("button", { name: "Rinta" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  },
});
