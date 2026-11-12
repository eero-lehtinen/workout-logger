import {
  createBrowserHistory,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { withBackStack } from "./lib/history-stack.ts";
import { routeTree } from "./routeTree.gen.ts";

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
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
