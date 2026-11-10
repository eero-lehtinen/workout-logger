import { clsx } from "clsx";
import { useState } from "react";

/** A name edited in place. Saves on blur or Enter; an empty name reverts. */
export function InlineName(props: {
  value: string;
  label: string;
  onSave: (name: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    const name = draft?.trim();
    setDraft(null);
    if (name && name !== props.value) props.onSave(name);
  };
  return (
    <input
      aria-label={props.label}
      value={draft ?? props.value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      className={clsx(
        "min-w-0 rounded-md bg-transparent px-1 -mx-1 outline-none hover:bg-surface focus:bg-raised focus:ring-2 focus:ring-ink",
        props.className,
      )}
    />
  );
}
