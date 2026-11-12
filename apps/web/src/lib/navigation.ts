import {
  type NavigateOptions,
  type RouterHistory,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import { type MouseEvent, useEffect, useEffectEvent } from "react";
import { settled } from "./history-stack.ts";

/** The parts of the router that moving back and between tabs use. */
export interface Navigator {
  history: RouterHistory;
  navigate: (options: NavigateOptions) => Promise<void>;
  buildLocation: (options: NavigateOptions) => { pathname: string };
}

/**
 * Gives an open dialog a history entry of its own, so back (the Android
 * back button and gesture included) closes it. Closing it any other way
 * goes back over that entry.
 */
export function useCloseOnBack(open: boolean, onClose: () => void) {
  const router = useRouter();
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (!open) return;
    const { history } = router;
    const id = crypto.randomUUID();
    let index: number | null = null;
    let closed = false;
    const unsubscribe = history.subscribe(({ location }) => {
      if (location.state.dialog === id) {
        index = location.state.__TSR_index;
      } else if (index !== null && location.state.__TSR_index <= index) {
        closed = true;
        close();
      }
    });
    history.push(history.location.href, { dialog: id });
    return () => {
      unsubscribe();
      if (closed) return;
      // A push still waiting for an earlier traversal is undone in order.
      if (index === null || history.location.state.dialog === id) {
        history.back();
      }
    };
  }, [open, router]);
}

/**
 * Returns to `target`, the screen a back arrow leads to: back through the
 * history when that is where this screen was opened from, keeping that
 * screen's state; otherwise in place of this screen, so back doesn't return
 * here.
 */
export async function goBack(router: Navigator, target: NavigateOptions) {
  // A dialog that just closed may still be leaving its entry.
  await settled(router.history);
  if (opensFrom(router, target, router.history.location.state.from)) {
    router.history.back();
    await settled(router.history);
  } else {
    await router.navigate({ ...target, replace: true });
  }
}

export function useGoBack() {
  const router = useRouter();
  return (target: NavigateOptions) => goBack(router, target);
}

/** Whether `goBack` would go back through the history. */
export function useGoesBack(target: NavigateOptions) {
  const router = useRouter();
  const from = useLocation({ select: (l) => l.state.from });
  return opensFrom(router, target, from);
}

function opensFrom(
  router: Navigator,
  target: NavigateOptions,
  from: string | undefined,
) {
  return (
    from !== undefined &&
    router.history.canGoBack() &&
    router.buildLocation(target).pathname === from
  );
}

export type Tab = "/" | "/history" | "/routines" | "/exercises" | "/settings";

/**
 * Opens a tab with the history reset to Today, then the tab: back from any
 * tab goes to Today, and back from Today leaves the app.
 */
export async function switchTab(router: Navigator, tab: Tab) {
  const { history } = router;
  // A dialog that just closed may still be leaving its entry.
  await settled(history);
  const index = history.location.state.__TSR_index;
  // The entry after Today can become the tab in place.
  if (tab !== "/" && index > 0) {
    history.go(1 - index);
    await settled(history);
    if (history.location.state.from === "/") {
      await router.navigate({ to: tab, replace: true });
      return;
    }
  }
  history.go(-history.location.state.__TSR_index);
  await settled(history);
  if (tab === "/") {
    if (history.location.pathname !== "/") {
      await router.navigate({ to: "/", replace: true });
    }
    return;
  }
  if (history.location.pathname !== "/") {
    // Written to the browser right away, so the push below can't merge into
    // it, and without rendering Today on the way.
    history.replace("/");
    history.flush();
  }
  await router.navigate({ to: tab });
}

export function useSwitchTab() {
  const router = useRouter();
  return (tab: Tab) => switchTab(router, tab);
}

/** A click that the app handles, not one that opens a new tab or window. */
export function isPlainClick(e: MouseEvent) {
  return e.button === 0 && !(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey);
}
