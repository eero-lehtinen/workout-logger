import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { clsx } from "clsx";

/** Pick one of a few options. */
export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <ToggleGroup
      aria-label={props.label}
      value={[props.value]}
      onValueChange={(values) => {
        const next = values[0] as T | undefined;
        if (next !== undefined) props.onChange(next);
      }}
      className="inline-flex rounded-lg bg-surface p-0.5"
    >
      {props.options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className={clsx(
            "rounded-md font-medium text-ink-muted transition-colors data-pressed:bg-raised data-pressed:text-ink data-pressed:shadow-sm",
            props.size === "sm"
              ? "h-8 min-w-9 px-2 text-sm"
              : "h-9 min-w-14 px-3 text-[0.9375rem]",
          )}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
