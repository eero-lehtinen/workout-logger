import { Menu } from "@base-ui/react/menu";
import { clsx } from "clsx";
import { Ellipsis } from "lucide-react";
import type { ReactNode } from "react";

export interface MoreMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

/** A "⋯" button in a header that opens the screen's less frequent actions. */
export function MoreMenu(props: { label: string; items: MoreMenuItem[] }) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={props.label}
        title={props.label}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-ink hover:bg-surface data-popup-open:bg-surface"
      >
        <Ellipsis size={20} />
      </Menu.Trigger>
      <Menu.Portal>
        {/* Above sheets (z-40), like Select. */}
        <Menu.Positioner
          className="z-50 outline-none"
          sideOffset={4}
          align="end"
        >
          <Menu.Popup className="min-w-48 origin-[var(--transform-origin)] rounded-2xl bg-raised p-1 text-ink shadow-lg ring-1 ring-rule transition-[scale,opacity] duration-100 ease-out outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {props.items.map((item) => (
              <Menu.Item
                key={item.label}
                onClick={item.onClick}
                className={clsx(
                  "flex h-11 cursor-default items-center gap-3 rounded-xl pr-4 pl-3 outline-none select-none data-highlighted:bg-surface",
                  item.danger && "text-danger",
                )}
              >
                {item.icon && (
                  <span
                    aria-hidden
                    className={clsx("flex", !item.danger && "text-ink-muted")}
                  >
                    {item.icon}
                  </span>
                )}
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
