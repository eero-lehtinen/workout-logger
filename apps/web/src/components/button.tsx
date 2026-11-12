import { clsx } from "clsx";
import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<ButtonVariant, string> = {
  // The one ink-filled button on a screen. A disabled one loses its fill, so
  // it never looks pressable.
  primary:
    "bg-ink font-semibold text-chalk hover:bg-ink/88 active:bg-ink/76 disabled:bg-surface disabled:text-ink-muted",
  secondary:
    "border border-rule bg-raised text-ink hover:bg-surface active:bg-rule/60 disabled:opacity-40",
  ghost: "text-ink hover:bg-surface active:bg-rule/60 disabled:opacity-40",
  // Red at rest, so it reads as an action on a phone too.
  danger:
    "text-danger hover:bg-danger/10 active:bg-danger/15 disabled:opacity-40",
};

const iconVariants: Record<ButtonVariant, string> = {
  ...variants,
  // Icons say what they do, so a row of them stays quiet until pointed at.
  danger:
    "text-ink-muted hover:bg-danger/10 hover:text-danger active:bg-danger/15 active:text-danger",
};

/**
 * Pulls a text-only danger button (size `md`) left by its padding, so its
 * text lines up with the content above.
 */
export const dangerAlignClass = "-ml-3.5";

const sizes = {
  sm: "h-8 gap-1.5 px-2.5 text-sm",
  md: "h-10 gap-2 px-3.5 text-[0.9375rem]",
  lg: "h-14 gap-2 px-5 text-lg font-semibold",
  xl: "h-20 gap-2.5 px-6 text-xl font-semibold",
};

export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: keyof typeof sizes = "md",
) {
  return clsx(
    "inline-flex shrink-0 items-center justify-center rounded-xl font-medium whitespace-nowrap select-none transition-colors disabled:pointer-events-none",
    variants[variant],
    sizes[size],
  );
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
}) {
  return (
    <button
      type={type}
      className={clsx(buttonClass(variant, size), className)}
      {...props}
    />
  );
}

/** A square icon button. `label` is its accessible name. */
export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & {
  label: string;
  variant?: ButtonVariant;
  size?: "md" | "lg";
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-xl transition-colors disabled:pointer-events-none disabled:opacity-30",
        size === "lg" ? "size-14" : "size-10",
        iconVariants[variant],
        className,
      )}
      {...props}
    />
  );
}
