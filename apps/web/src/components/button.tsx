import { clsx } from "clsx";
import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary:
    "border border-ink/30 bg-surface font-semibold text-ink hover:bg-rule/60 active:bg-rule",
  secondary:
    "border border-rule bg-raised text-ink hover:bg-surface active:bg-rule/60",
  ghost: "text-ink hover:bg-surface active:bg-rule/60",
  danger: "text-danger hover:bg-danger/10 active:bg-danger/15",
};

const sizes = {
  sm: "h-8 gap-1.5 rounded-md px-2.5 text-sm",
  md: "h-10 gap-2 rounded-lg px-3.5 text-[0.9375rem]",
  lg: "h-14 gap-2 rounded-xl px-5 text-lg font-semibold",
};

export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: keyof typeof sizes = "md",
) {
  return clsx(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none transition-colors disabled:pointer-events-none disabled:opacity-40",
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
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { label: string; variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-30",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
