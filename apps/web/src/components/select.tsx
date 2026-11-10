import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A native dropdown: phones show their own picker. `label` names it for
 * screen readers; the chosen option says what it is. The browser's own
 * arrow is hidden for one drawn with consistent spacing, and `icon` can say
 * what the choice does, e.g. sorting.
 */
export function Select<T extends string>(props: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  icon?: ReactNode;
  size?: "sm" | "md";
  className?: string | undefined;
}) {
  const sm = props.size === "sm";
  return (
    <span
      className={clsx(
        "relative inline-flex min-w-0 items-center text-ink-muted",
        props.className,
      )}
    >
      {props.icon && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-2.5 flex"
        >
          {props.icon}
        </span>
      )}
      <select
        aria-label={props.label}
        title={props.label}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as T)}
        className={clsx(
          "w-full min-w-0 appearance-none rounded-lg bg-raised pr-8 font-medium text-ink ring-1 ring-rule outline-none focus-visible:ring-2 focus-visible:ring-ink",
          sm ? "h-9 text-sm" : "h-10",
          props.icon ? "pl-8" : "pl-3",
        )}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        size={sm ? 15 : 17}
        className="pointer-events-none absolute right-2.5"
      />
    </span>
  );
}
