import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button.tsx";

const backdropClass =
  "fixed inset-0 z-40 min-h-dvh bg-scrim/45 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute";

/** A bottom sheet on phones, a centered panel on wide screens. */
const popupClass =
  "fixed inset-x-0 bottom-0 z-40 flex max-h-[92dvh] flex-col rounded-t-2xl bg-raised pb-[env(safe-area-inset-bottom)] text-ink shadow-xl outline-none transition-[translate,opacity] duration-200 ease-out data-ending-style:translate-y-8 data-ending-style:opacity-0 data-starting-style:translate-y-8 data-starting-style:opacity-0 lg:inset-x-auto lg:top-[8vh] lg:bottom-auto lg:left-1/2 lg:max-h-[84vh] lg:w-[34rem] lg:-translate-x-1/2 lg:rounded-2xl lg:pb-0 lg:data-ending-style:translate-y-2 lg:data-starting-style:translate-y-2";

export function Sheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={popupClass}>
          <TitleBar title={props.title} />
          <div className="min-h-0 flex-1 overflow-y-auto">{props.children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Covers the whole window, for content that wants all the room there is.
 * `children` go in a flex column that doesn't scroll.
 */
export function FullScreen(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Popup className="fixed inset-0 z-40 flex flex-col bg-chalk pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-ink outline-none transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0">
          <TitleBar title={props.title} />
          <div className="flex min-h-0 flex-1 flex-col">{props.children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TitleBar(props: { title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-rule py-2 pr-2 pl-4">
      <Dialog.Title className="flex-1 text-lg font-semibold">
        {props.title}
      </Dialog.Title>
      <Dialog.Close
        aria-label="Close"
        className="flex size-10 items-center justify-center rounded-xl hover:bg-surface"
      >
        <X size={20} />
      </Dialog.Close>
    </div>
  );
}

export interface ConfirmAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "danger" | "secondary";
}

/** A question with explicit answers. Every action closes it. */
export function Confirm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  actions: ConfirmAction[];
  cancelLabel?: string;
  /** The cancel button only, not Escape or a press outside. */
  onCancel?: () => void;
}) {
  return (
    <AlertDialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={backdropClass} />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-40 flex w-[22rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl bg-raised p-5 text-ink shadow-xl transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <div className="flex flex-col gap-1.5">
            <AlertDialog.Title className="text-lg font-semibold">
              {props.title}
            </AlertDialog.Title>
            {props.description && (
              <AlertDialog.Description className="text-[0.9375rem] text-ink-muted">
                {props.description}
              </AlertDialog.Description>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {props.actions.map((action) => (
              <Button
                key={action.label}
                variant={
                  action.variant === "danger"
                    ? "secondary"
                    : (action.variant ?? "primary")
                }
                className={
                  action.variant === "danger" ? "text-danger" : undefined
                }
                onClick={() => {
                  props.onOpenChange(false);
                  action.onClick();
                }}
              >
                {action.label}
              </Button>
            ))}
            <AlertDialog.Close
              onClick={props.onCancel}
              className="h-10 rounded-xl text-[0.9375rem] font-medium text-ink-muted hover:bg-surface"
            >
              {props.cancelLabel ?? "Cancel"}
            </AlertDialog.Close>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
