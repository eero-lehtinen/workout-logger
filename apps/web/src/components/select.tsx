import { Select as BaseSelect } from "@base-ui/react/select";
import { clsx } from "clsx";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { usePopupCollisionPadding } from "../lib/safe-area.ts";

/**
 * A dropdown drawn by the app. A native `<select>` would open the Android
 * WebView's dated system dialog, which can't be styled. `label` names it for
 * screen readers; the chosen option shows on the trigger, after `icon` if
 * given (e.g. a sort icon saying what the choice does).
 */
export function Select<T extends string>(props: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  icon?: ReactNode;
  /** `lg` matches a search field's height. */
  size?: "sm" | "md" | "lg";
  className?: string | undefined;
}) {
  const sm = props.size === "sm";
  const collisionPadding = usePopupCollisionPadding();
  return (
    <BaseSelect.Root
      items={props.options}
      value={props.value}
      onValueChange={(value) => {
        if (value !== null) props.onChange(value as T);
      }}
    >
      <BaseSelect.Trigger
        aria-label={props.label}
        title={props.label}
        className={clsx(
          "inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-xl bg-raised pr-2 font-medium text-ink ring-1 ring-rule outline-none select-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-ink data-popup-open:bg-surface",
          { sm: "h-9 text-sm", md: "h-10", lg: "h-11" }[props.size ?? "md"],
          props.icon ? "pl-2.5" : "pl-3",
          props.className,
        )}
      >
        {props.icon && (
          <span aria-hidden className="flex text-ink-muted">
            {props.icon}
          </span>
        )}
        <BaseSelect.Value className="truncate" />
        <BaseSelect.Icon className="flex text-ink-muted">
          <ChevronDown size={sm ? 15 : 17} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        {/* Above sheets (z-40), e.g. the sort in the exercise picker. */}
        <BaseSelect.Positioner
          className="z-50 outline-none select-none"
          sideOffset={6}
          alignItemWithTrigger={false}
          collisionPadding={collisionPadding}
        >
          <BaseSelect.Popup className="min-w-[var(--anchor-width)] origin-[var(--transform-origin)] rounded-2xl bg-raised p-1 text-ink shadow-lg ring-1 ring-rule transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <BaseSelect.List className="max-h-[var(--available-height)] overflow-y-auto">
              {props.options.map((o) => (
                <BaseSelect.Item
                  key={o.value}
                  value={o.value}
                  className={clsx(
                    "grid cursor-default grid-cols-[1.25rem_1fr] items-center gap-1.5 rounded-xl pr-4 pl-2 outline-none select-none data-highlighted:bg-surface",
                    sm ? "h-10 text-sm" : "h-11",
                  )}
                >
                  <BaseSelect.ItemIndicator className="col-start-1 flex">
                    <Check size={16} strokeWidth={2.5} />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText className="col-start-2 whitespace-nowrap">
                    {o.label}
                  </BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
