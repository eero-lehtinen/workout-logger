/*
 * The live-update switch reloads the WebView at the app's root
 * (Bridge.setServerBasePath loads the start URL), so the new build would
 * open on Today. The screen is kept in sessionStorage across that reload:
 * it survives a navigation of the same WebView but not the process, so a
 * cold start still opens Today.
 */

const KEY = "live-update-switch-route";

type RouteStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The URL path, search and hash; what the router reads at start. */
export function rememberRoute(storage: RouteStorage, route: string): void {
  try {
    storage.setItem(KEY, route);
  } catch {
    // Without storage the new build opens on Today, as a cold start does.
  }
}

export function forgetRoute(storage: RouteStorage): void {
  try {
    storage.removeItem(KEY);
  } catch {}
}

/** The remembered route, once: reading it forgets it. */
export function takeRoute(storage: RouteStorage): string | null {
  let route: string | null;
  try {
    route = storage.getItem(KEY);
    storage.removeItem(KEY);
  } catch {
    return null;
  }
  // A protocol-relative "//host" would be another origin.
  if (!route?.startsWith("/") || route.startsWith("//")) return null;
  return route;
}
