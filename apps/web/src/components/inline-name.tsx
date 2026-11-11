import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";

/** A name edited in place. Saves on blur or Enter; an empty name reverts. */
export function InlineName(props: {
  value: string;
  label: string;
  onSave: (name: string) => void;
  /** Focuses with the name selected, e.g. a placeholder name to replace. */
  select?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const { select } = props;
  useEffect(() => {
    if (select) ref.current?.select();
  }, [select]);
  const save = () => {
    const name = draft?.trim();
    setDraft(null);
    if (name && name !== props.value) props.onSave(name);
  };
  return (
    <input
      ref={ref}
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
        "min-w-0 rounded-xl bg-transparent px-1 -mx-1 outline-none hover:bg-surface focus:bg-raised focus:ring-2 focus:ring-ink",
        props.className,
      )}
    />
  );
}
