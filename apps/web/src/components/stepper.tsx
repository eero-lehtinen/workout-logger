import { clsx } from "clsx";
import { Minus, Plus } from "lucide-react";
import { useId, useRef, useState } from "react";

export interface StepperProps {
  label: string;
  unit?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step: (value: number, direction: 1 | -1) => number;
  format?: (value: number) => string;
  parse?: (text: string) => number | null;
  inputMode?: "decimal" | "numeric";
  size?: "lg" | "md" | undefined;
}

/**
 * A number with −/+ buttons and a text field that opens the numeric keypad.
 * While the field has focus it shows the typed text; otherwise `format`.
 * The first character typed after focusing replaces the value, like a
 * select-all, without selecting: on phones a selection brings up handles and
 * the copy/paste bar over the entry panel.
 */
export function Stepper(props: StepperProps) {
  const id = useId();
  const format = props.format ?? String;
  const parse = props.parse ?? parseNumber;
  const [draft, setDraft] = useState<string | null>(null);
  const fresh = useRef(false);
  const text = draft ?? (props.value === null ? "" : format(props.value));
  const large = props.size !== "md";

  const press = (direction: 1 | -1) => {
    setDraft(null);
    props.onChange(props.step(props.value ?? 0, direction));
  };

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={id}
        className="flex w-16 shrink-0 flex-col text-sm leading-tight text-ink-muted"
      >
        {props.label}
        {props.unit && (
          <span className="text-xs">
            <span className="sr-only"> in </span>
            {props.unit}
          </span>
        )}
      </label>
      <StepButton
        label={`Less ${props.label.toLowerCase()}`}
        large={large}
        onClick={() => press(-1)}
      >
        <Minus size={large ? 22 : 18} />
      </StepButton>
      <div className="min-w-0 flex-1">
        <input
          id={id}
          type="text"
          inputMode={props.inputMode ?? "decimal"}
          autoComplete="off"
          enterKeyHint="done"
          value={text}
          onFocus={() => {
            setDraft(text);
            fresh.current = true;
          }}
          onChange={(e) => {
            const input = e.nativeEvent as InputEvent;
            const typed = input.inputType?.startsWith("insert")
              ? input.data
              : null;
            const next = fresh.current
              ? replaceOnInsert(text, e.target.value, typed)
              : e.target.value;
            fresh.current = false;
            setDraft(next);
            props.onChange(parse(next));
          }}
          onBlur={() => setDraft(null)}
          className={clsx(
            "w-full rounded-xl bg-raised text-center outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink",
            large
              ? "numerals h-14 text-[1.75rem]"
              : "tabular h-11 text-lg font-semibold",
          )}
        />
      </div>
      <StepButton
        label={`More ${props.label.toLowerCase()}`}
        large={large}
        onClick={() => press(1)}
      >
        <Plus size={large ? 22 : 18} />
      </StepButton>
    </div>
  );
}

function StepButton(props: {
  label: string;
  large: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={props.onClick}
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-full bg-surface text-ink transition-colors hover:bg-rule active:bg-rule",
        props.large ? "size-14" : "size-11",
      )}
    >
      {props.children}
    </button>
  );
}

/**
 * If typing `inserted` only added it to `before`, returns `inserted`;
 * otherwise `after`. Deleting and replacing a selection edit normally.
 */
export function replaceOnInsert(
  before: string,
  after: string,
  inserted: string | null,
): string {
  return inserted && after.length === before.length + inserted.length
    ? inserted
    : after;
}

/** Accepts a comma as the decimal separator; empty text is no value. */
export function parseNumber(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (normalized === "") return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** `m:ss`, `ss`, or plain seconds. */
export function parseDuration(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.some((p) => p === "" || !/^\d+$/.test(p)) || parts.length > 3) {
    return null;
  }
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}
