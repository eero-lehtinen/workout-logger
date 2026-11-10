import { Toast } from "@base-ui/react/toast";
import { X } from "lucide-react";

/** Usable outside React, e.g. from command handlers. */
export const toasts = Toast.createToastManager();

export function ToastLayer() {
  return (
    <Toast.Provider toastManager={toasts} timeout={6000} limit={3}>
      <Toast.Portal>
        <Toast.Viewport className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 z-50 mx-auto w-auto max-w-sm lg:right-6 lg:bottom-6 lg:left-auto lg:w-sm">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

// Stacking variables follow the Base UI toast example.
const rootClass =
  "[--gap:0.5rem] [--peek:0.5rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] absolute right-0 bottom-0 left-0 z-[calc(1000-var(--toast-index))] w-full origin-bottom [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] rounded-xl bg-ink text-chalk shadow-lg select-none after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-[''] data-ending-style:opacity-0 data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--offset-y)))] data-limited:opacity-0 data-starting-style:[transform:translateY(150%)] [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)] data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))] data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))] data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))] h-[var(--height)] data-expanded:h-[var(--toast-height)] [transition:transform_0.4s_cubic-bezier(0.22,1,0.36,1),opacity_0.4s,height_0.15s]";

function ToastList() {
  const { toasts: list } = Toast.useToastManager();
  return list.map((toast) => (
    <Toast.Root key={toast.id} toast={toast} className={rootClass}>
      <Toast.Content className="flex items-center gap-3 overflow-hidden py-2.5 pr-2 pl-4 transition-opacity data-behind:opacity-0 data-expanded:opacity-100">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Toast.Title
            className={
              toast.type === "error"
                ? "text-sm font-semibold text-[color-mix(in_oklab,var(--danger)_45%,var(--chalk))]"
                : "text-sm font-medium"
            }
          />
          <Toast.Description className="text-sm opacity-75" />
        </div>
        <Toast.Action className="h-9 shrink-0 rounded-lg px-3 text-sm font-semibold text-pr hover:bg-chalk/10" />
        <Toast.Close
          aria-label="Dismiss"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg opacity-70 hover:bg-chalk/10 hover:opacity-100"
        >
          <X size={16} />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}
