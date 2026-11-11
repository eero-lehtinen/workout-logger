import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { clsx } from "clsx";

type Choice<T extends string> =
  | { deselectable?: false; value: T; onChange: (value: T) => void }
  /** Pressing the chosen option again clears it. */
  | {
      deselectable: true;
      value: T | null;
      onChange: (value: T | null) => void;
    };

/** Pick one of a few options. */
export function Segmented<T extends string>(
  props: Choice<T> & {
    label: string;
    options: readonly { value: T; label: string }[];
    size?: "sm" | "md";
  },
) {
  return (
    <ToggleGroup
      aria-label={props.label}
      value={props.value === null ? [] : [props.value]}
      onValueChange={(values) => {
        const next = values[0] as T | undefined;
        if (next !== undefined) props.onChange(next);
        else if (props.deselectable) props.onChange(null);
      }}
      // The track's 4px padding keeps the thumb's corners concentric with it
      // (12px outside, 8px inside).
      className="inline-flex shrink-0 rounded-xl bg-surface p-1"
    >
      {props.options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className={clsx(
            "rounded-lg font-medium whitespace-nowrap text-ink-muted transition-colors data-pressed:bg-selected data-pressed:text-ink data-pressed:shadow-sm",
            props.size === "sm"
              ? "h-7 min-w-9 px-2.5 text-sm"
              : "h-8 min-w-14 px-3 text-[0.9375rem]",
          )}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
