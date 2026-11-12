import { Toast } from "@base-ui/react/toast";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { type CSSProperties, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMediaQuery, WIDE } from "../lib/use-media-query.ts";

/** Usable outside React, e.g. from command handlers. */
export const toasts = Toast.createToastManager();

export function ToastLayer() {
  return (
    <Toast.Provider toastManager={toasts} timeout={6000} limit={3}>
      <Toast.Portal>
        <Viewport />
      </Toast.Portal>
    </Toast.Provider>
  );
}

/**
 * Phones: at the bottom, in thumb reach, above whatever is fixed there (the
 * tab bar, a screen's footer, the rest timer). Wide screens: top right.
 */
function Viewport() {
  const wide = useMediaQuery(WIDE);
  const { toasts: list } = Toast.useToastManager();
  const bottom = useBottomChrome(!wide && list.length > 0);
  return (
    <Toast.Viewport
      style={{ "--chrome-bottom": `${bottom}px` } as CSSProperties}
      className={
        wide
          ? "fixed top-6 right-6 z-50 w-sm"
          : "fixed right-4 bottom-[calc(var(--chrome-bottom)+0.75rem)] left-4 z-50 mx-auto w-auto max-w-sm"
      }
    >
      <ToastList anchor={wide ? "top" : "bottom"} />
    </Toast.Viewport>
  );
}

/**
 * How far from the window's bottom the fixed elements marked
 * `data-bottom-chrome` reach. Footers change with the screen and the rest
 * timer comes and goes, so it is measured while toasts are shown.
 */
function useBottomChrome(active: boolean): number {
  const [bottom, setBottom] = useState(0);
  useLayoutEffect(() => {
    if (!active) return;
    const measure = () => {
      let reach = 0;
      for (const el of document.querySelectorAll("[data-bottom-chrome]")) {
        const rect = el.getBoundingClientRect();
        if (rect.height > 0) {
          reach = Math.max(reach, window.innerHeight - rect.top);
        }
      }
      setBottom(Math.round(reach));
    };
    measure();
    const id = setInterval(measure, 250);
    return () => clearInterval(id);
  }, [active]);
  return bottom;
}

// Stacking variables follow the Base UI toast examples, anchored at the top
// or, mirrored, at the bottom.
const shared =
  "[--gap:0.5rem] [--peek:0.5rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))] [--height:var(--toast-frontmost-height,var(--toast-height))] absolute right-0 left-0 z-[calc(1000-var(--toast-index))] mx-auto w-full rounded-2xl border border-rule bg-raised text-ink shadow-lg select-none after:absolute after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-[''] data-ending-style:opacity-0 data-limited:opacity-0 data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))] data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))] h-[var(--height)] data-expanded:h-[var(--toast-height)] [transition:transform_0.4s_cubic-bezier(0.22,1,0.36,1),opacity_0.4s,height_0.15s]";

const anchored = {
  top: "[--offset-y:calc(var(--toast-offset-y)+(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y))] top-0 origin-top [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--peek))+(var(--shrink)*var(--height))))_scale(var(--scale))] after:bottom-full data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--offset-y)))] data-starting-style:[transform:translateY(-150%)] [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(-150%)] data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))] data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
  bottom:
    "[--offset-y:calc(var(--toast-offset-y)*-1+(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] bottom-0 origin-bottom [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] after:top-full data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--offset-y)))] data-starting-style:[transform:translateY(150%)] [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)] data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))] data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
};

function ToastList(props: { anchor: "top" | "bottom" }) {
  const { t } = useTranslation();
  const { toasts: list } = Toast.useToastManager();
  return list.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      swipeDirection={[props.anchor === "top" ? "up" : "down", "right"]}
      className={clsx(shared, anchored[props.anchor])}
    >
      <Toast.Content className="flex items-center gap-3 overflow-hidden py-2.5 pr-2 pl-4 transition-opacity data-behind:opacity-0 data-expanded:opacity-100">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Toast.Title
            className={
              toast.type === "error"
                ? "text-sm font-semibold text-danger"
                : "text-sm font-medium"
            }
          />
          <Toast.Description className="text-sm opacity-75" />
        </div>
        <Toast.Action className="h-9 shrink-0 rounded-xl px-3 text-sm font-semibold text-ink underline underline-offset-2 hover:bg-surface" />
        <Toast.Close
          aria-label={t("ui.toasts.dismiss")}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl opacity-70 hover:bg-surface hover:opacity-100"
        >
          <X size={16} />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}
