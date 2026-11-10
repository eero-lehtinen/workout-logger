import { Toast } from "@base-ui/react/toast";
import { X } from "lucide-react";

/** Usable outside React, e.g. from command handlers. */
export const toasts = Toast.createToastManager();

export function ToastLayer() {
  return (
    <Toast.Provider toastManager={toasts} timeout={6000} limit={3}>
      <Toast.Portal>
        <Toast.Viewport className="fixed top-[calc(0.75rem+env(safe-area-inset-top))] right-4 left-4 z-50 mx-auto w-auto max-w-sm lg:top-6 lg:right-6 lg:left-auto lg:w-sm">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

// Stacking variables follow the Base UI top-anchored toast example. Toasts
// sit at the top so they never cover the set entry in the thumb zone.
const rootClass =
  "[--gap:0.5rem] [--peek:0.5rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)+(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y))] absolute top-0 right-0 left-0 z-[calc(1000-var(--toast-index))] mx-auto w-full origin-top [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--peek))+(var(--shrink)*var(--height))))_scale(var(--scale))] rounded-xl border border-rule bg-raised text-ink shadow-lg select-none after:absolute after:bottom-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-[''] data-ending-style:opacity-0 data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--offset-y)))] data-limited:opacity-0 data-starting-style:[transform:translateY(-150%)] [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(-150%)] data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))] data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))] data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))] data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))] h-[var(--height)] data-expanded:h-[var(--toast-height)] [transition:transform_0.4s_cubic-bezier(0.22,1,0.36,1),opacity_0.4s,height_0.15s]";
function ToastList() {
  const { toasts: list } = Toast.useToastManager();
  return list.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      swipeDirection={["up", "right"]}
      className={rootClass}
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
        <Toast.Action className="h-9 shrink-0 rounded-lg px-3 text-sm font-semibold text-ink underline underline-offset-2 hover:bg-surface" />
        <Toast.Close
          aria-label="Dismiss"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg opacity-70 hover:bg-surface hover:opacity-100"
        >
          <X size={16} />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}
