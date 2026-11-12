import { useSyncExternalStore } from "react";

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Base UI's default `collisionPadding`. */
const POPUP_EDGE_GAP = 5;

let cached: Insets | undefined;
let stale = true;

/** `env()` can't be read from script, so a probe element resolves it to px. */
function measure(): Insets {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const insets = {
    top: Number.parseFloat(style.paddingTop) || 0,
    right: Number.parseFloat(style.paddingRight) || 0,
    bottom: Number.parseFloat(style.paddingBottom) || 0,
    left: Number.parseFloat(style.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}

function getSnapshot(): Insets {
  if (stale || !cached) {
    const next = measure();
    if (
      !cached ||
      next.top !== cached.top ||
      next.right !== cached.right ||
      next.bottom !== cached.bottom ||
      next.left !== cached.left
    ) {
      cached = next;
    }
    stale = false;
  }
  return cached;
}

function subscribe(onChange: () => void) {
  const listener = () => {
    stale = true;
    onChange();
  };
  addEventListener("resize", listener);
  return () => removeEventListener("resize", listener);
}

/**
 * `collisionPadding` for Base UI positioners. Their collision boundary is the
 * viewport, which on Android (drawn edge to edge) includes the status bar, so
 * without this a popup above an anchor near the header lands under the notch.
 */
export function usePopupCollisionPadding(): Insets {
  const insets = useSyncExternalStore(subscribe, getSnapshot);
  return {
    top: insets.top + POPUP_EDGE_GAP,
    right: insets.right + POPUP_EDGE_GAP,
    bottom: insets.bottom + POPUP_EDGE_GAP,
    left: insets.left + POPUP_EDGE_GAP,
  };
}
