import {
  createBrowserHistory,
  createRouter,
  type RouterHistory,
  RouterProvider,
} from "@tanstack/react-router";
import { type DbPreload, useDbPreload } from "./db/react.tsx";
import { withBackStack } from "./lib/history-stack.ts";
import { routeTree } from "./routeTree.gen.ts";

export interface RouterContext {
  preload: DbPreload;
}

/**
 * The app's router. Each screen's scrolling body is restored when returning
 * to it (see Screen); a newly opened screen mounts a fresh body at the top.
 * Restoration is keyed by path, not history entry: a back arrow or a tab
 * often returns to a screen through a new entry, and should find it where
 * it was.
 */
export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    defaultPreload: false,
    scrollRestoration: true,
    getScrollRestorationKey: (location) => location.pathname,
    history: withBackStack(history ?? createBrowserHistory()),
    // A screen visited before may have lost its queries from the cache, or
    // the database may have been reopened with a new cache. Its loader must
    // finish before the screen shows, or the screen suspends (see DbPreload).
    defaultStaleReloadMode: "blocking",
    // AppRouterProvider sets the context before the first load.
    context: { preload: undefined as unknown as DbPreload },
  });
}

/** Renders `router` with the open database's preload in its context. */
export function AppRouterProvider(props: {
  router: ReturnType<typeof createAppRouter>;
}) {
  const preload = useDbPreload();
  return <RouterProvider router={props.router} context={{ preload }} />;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
