import { clsx } from "clsx";
import { useState } from "react";

/**
 * Free text edited in place. Saves on blur, trimmed, and only when it changed,
 * so tabbing through doesn't write.
 */
export function NotesField(props: {
  label: string;
  value: string;
  placeholder: string;
  onSave: (notes: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <textarea
      aria-label={props.label}
      value={draft ?? props.value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft.trim() !== props.value) {
          props.onSave(draft.trim());
        }
        setDraft(null);
      }}
      placeholder={props.placeholder}
      rows={2}
      className={clsx(
        "field-sizing-content min-h-16 w-full resize-none rounded-lg bg-raised px-3 py-2 text-[0.9375rem] outline-none ring-1 ring-rule placeholder:text-ink-muted focus:ring-2 focus:ring-ink",
        props.className,
      )}
    />
  );
}
