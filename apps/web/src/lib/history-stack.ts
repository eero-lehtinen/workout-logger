import type { RouterHistory } from "@tanstack/react-router";

declare module "@tanstack/react-router" {
  interface HistoryState {
    /** The pathname of the entry this one was pushed from. */
    from?: string;
    /** The open dialog this entry stands for, see `useCloseOnBack`. */
    dialog?: string;
  }
}

/**
 * A traversal off the start of the history (an Android back that closes the
 * app) never reports landing, so waiting for one gives up after this long.
 */
const TRAVERSAL_TIMEOUT_MS = 1000;

const pendingTraversals = new WeakMap<RouterHistory, Promise<void>>();

/**
 * Prepares the router's history for the in-app back handling
 * (docs/architecture.md#navigation-and-back):
 *
 * - Each pushed entry records the pathname it was pushed from, so a back
 *   arrow knows whether going back reaches its target.
 * - Leaving a page while one of its dialogs has an entry replaces that
 *   entry, so back doesn't return to a dialog that is gone.
 * - A browser `back` or `go` lands later, on `popstate`. Pushes and
 *   replaces wait for it; run right away, the browser could apply them
 *   before the traversal and the traversal would undo them.
 */
export function withBackStack(history: RouterHistory): RouterHistory {
  const raw = {
    push: history.push,
    replace: history.replace,
    back: history.back,
    go: history.go,
  };

  const run = (task: () => Promise<void> | undefined) => {
    const pending = pendingTraversals.get(history);
    const started = pending ? pending.then(task) : task();
    if (!started) return;
    const done: Promise<void> = started.then(() => {
      if (pendingTraversals.get(history) === done) {
        pendingTraversals.delete(history);
      }
    });
    pendingTraversals.set(history, done);
  };

  const traverse = (start: () => void) =>
    new Promise<void>((resolve) => {
      const finish = () => {
        unsubscribe();
        clearTimeout(timer);
        resolve();
      };
      const unsubscribe = history.subscribe(finish);
      const timer = setTimeout(finish, TRAVERSAL_TIMEOUT_MS);
      start();
    });

  history.push = (path, state, opts) =>
    run(() => {
      const here = history.location;
      // The router reloads in place for a link to the current URL, but only
      // while the states match, and `from` makes them differ.
      const sameUrl = path === here.href && state?.dialog === undefined;
      const leavingDialog =
        here.state.dialog !== undefined && pathnameOf(path) !== here.pathname;
      if (sameUrl || leavingDialog) {
        raw.replace(path, { ...state, from: here.state.from }, opts);
      } else {
        raw.push(path, { ...state, from: here.pathname }, opts);
      }
      return undefined;
    });
  history.replace = (path, state, opts) =>
    run(() => {
      raw.replace(path, { ...state, from: history.location.state.from }, opts);
      return undefined;
    });
  history.back = (opts) =>
    run(() =>
      history.canGoBack() ? traverse(() => raw.back(opts)) : undefined,
    );
  history.go = (delta, opts) =>
    run(() => (delta === 0 ? undefined : traverse(() => raw.go(delta, opts))));
  return history;
}

/** Resolves once no `back` or `go` is waiting to land. */
export function settled(history: RouterHistory): Promise<void> {
  return pendingTraversals.get(history) ?? Promise.resolve();
}

function pathnameOf(path: string) {
  return path.split(/[?#]/, 1)[0];
}
