import { MUSCLE_GROUPS } from "@workout-logger/exercises";
import { clsx } from "clsx";
import type { ReactNode } from "react";

/**
 * Chips that pick one muscle group, or all exercises with `null`.
 * `children` (e.g. the sort) wrap with the chips, at the end of the row.
 */
export function MuscleGroupFilter(props: {
  value: string | null;
  onChange: (group: string | null) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {[null, ...MUSCLE_GROUPS].map((g) => (
        <button
          key={g ?? "all"}
          type="button"
          aria-pressed={props.value === g}
          onClick={() => props.onChange(g)}
          className={clsx(
            "h-9 shrink-0 rounded-full px-3.5 text-sm font-medium",
            props.value === g
              ? "bg-selected text-ink ring-2 ring-ink/50"
              : "bg-surface text-ink-muted hover:text-ink",
          )}
        >
          {g ?? "All"}
        </button>
      ))}
      {props.children && <div className="ml-auto">{props.children}</div>}
    </div>
  );
}
