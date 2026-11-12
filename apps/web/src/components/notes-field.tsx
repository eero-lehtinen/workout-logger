import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";

/**
 * Free text edited in place. Saves on blur, trimmed, and only when it changed,
 * so tabbing through doesn't write.
 */
export function NotesField(props: {
  label: string;
  value: string;
  placeholder: string;
  onSave: (notes: string) => void;
  /** Focus when shown, for a field opened by an "Add note" button. */
  focusOnMount?: boolean;
  /** After saving, with the trimmed text. */
  onBlur?: (text: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (props.focusOnMount) ref.current?.focus();
  }, [props.focusOnMount]);
  return (
    <textarea
      ref={ref}
      aria-label={props.label}
      value={draft ?? props.value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const text = (draft ?? props.value).trim();
        if (draft !== null && text !== props.value) props.onSave(text);
        setDraft(null);
        props.onBlur?.(text);
      }}
      placeholder={props.placeholder}
      rows={2}
      className={clsx(
        "field-sizing-content min-h-16 w-full resize-none rounded-xl bg-raised px-3 py-2 text-[0.9375rem] outline-none ring-1 ring-rule placeholder:text-ink-muted focus:ring-2 focus:ring-ink",
        props.className,
      )}
    />
  );
}
