import { clsx } from "clsx";

/**
 * A native dropdown: phones show their own picker. `label` names it for
 * screen readers; the chosen option says what it is.
 */
export function Select<T extends string>(props: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  className?: string;
}) {
  return (
    <select
      aria-label={props.label}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value as T)}
      className={clsx(
        "h-10 min-w-0 rounded-lg bg-raised pr-2 pl-3 font-medium ring-1 ring-rule outline-none focus-visible:ring-2 focus-visible:ring-ink",
        props.className,
      )}
    >
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
