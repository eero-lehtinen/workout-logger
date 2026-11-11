import type { StoryObj } from "@storybook/react-vite";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { useState } from "react";
import { within } from "storybook/test";
import type { DbClient } from "../db/client.ts";
import { type MemoryDb, openMemoryDb } from "../db/memory.ts";
import { DbClientProvider } from "../db/react.tsx";
import { setSignInProvidersForStory } from "../lib/sign-in-providers.ts";
import { setUsageForStory } from "../lib/usage.ts";
import { createAppRouter } from "../router.ts";
import type { Fixture, FixtureIds } from "./fixtures.ts";

interface Loaded {
  db: MemoryDb;
  url: string;
}

/**
 * A whole screen: the real router at `url`, over an in-memory database that
 * `fixture` filled through the real commands.
 */
export function pageStory(options: {
  fixture: Fixture;
  url: (ids: FixtureIds) => string;
  viewport?: "phone" | "pc";
  theme?: "light" | "dark";
  play?: StoryObj["play"];
}): StoryObj {
  return {
    loaders: [
      async (): Promise<Loaded> => {
        // Every story in the browser shares both storages: the router keeps
        // scroll positions in one, view preferences live in the other.
        sessionStorage.clear();
        localStorage.clear();
        setSignInProvidersForStory(["google"]);
        setUsageForStory(null);
        const db = await openMemoryDb();
        return { db, url: options.url(await options.fixture(db)) };
      },
    ],
    render: (_args, { loaded }) => {
      const { db, url } = loaded as Loaded;
      return <Page client={db.client} url={url} />;
    },
    globals: {
      viewport: { value: options.viewport ?? "phone", isRotated: false },
      ...(options.theme && { theme: options.theme }),
    },
    // Wait for the screen's data, so checks run on the screen, not on a
    // loading state.
    play: async (context) => {
      await within(context.canvasElement).findAllByRole(
        "heading",
        { level: 1 },
        { timeout: 10_000 },
      );
      await options.play?.(context);
    },
  };
}

function Page(props: { client: DbClient; url: string }) {
  const [router] = useState(() =>
    createAppRouter(createMemoryHistory({ initialEntries: [props.url] })),
  );
  return (
    <DbClientProvider client={props.client}>
      <RouterProvider router={router} />
    </DbClientProvider>
  );
}
