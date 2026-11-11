import { clsx } from "clsx";
import type { ComponentProps } from "react";

/**
 * A rounded choice. Selected (`aria-pressed`, or `aria-checked` for radios)
 * uses the segmented control's raised fill and shadow.
 */
export function chipClass(size: "sm" | "md" = "sm") {
  return clsx(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-surface font-medium whitespace-nowrap text-ink-muted transition-colors select-none hover:text-ink",
    "aria-pressed:bg-selected aria-pressed:text-ink aria-pressed:shadow-sm aria-checked:bg-selected aria-checked:text-ink aria-checked:shadow-sm",
    size === "sm" ? "h-9 px-3.5 text-sm" : "h-10 px-4",
  );
}

/** A chip that toggles. */
export function Chip({
  pressed,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { pressed: boolean; size?: "sm" | "md" }) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={clsx(chipClass(size), className)}
      {...props}
    />
  );
}
