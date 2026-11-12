import { clsx } from "clsx";
import { Minus, Plus } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

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
 * The label and unit sit inside the field, beside the number, so the number
 * gets the width a label column would take.
 * While the field has focus it shows the typed text; otherwise `format`.
 * The first character typed after focusing replaces the value, like a
 * select-all, without selecting: on phones a selection brings up handles and
 * the copy/paste bar over the entry panel.
 */
export function Stepper(props: StepperProps) {
  const { t } = useTranslation();
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
      <StepButton
        label={t("ui.stepper.less", { label: props.label.toLowerCase() })}
        large={large}
        onClick={() => press(-1)}
      >
        <Minus size={large ? 22 : 18} />
      </StepButton>
      <div
        className={clsx(
          "flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-raised px-3 text-ink-muted ring-1 ring-rule focus-within:ring-2 focus-within:ring-ink",
          large ? "h-14 text-sm" : "h-11 text-xs",
        )}
      >
        <label htmlFor={id} className="flex h-full shrink-0 items-center">
          {props.label}
          {props.unit && (
            <span className="sr-only">
              {" "}
              {t("ui.stepper.inUnit", { unit: props.unit })}
            </span>
          )}
        </label>
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
            "h-full w-full min-w-0 bg-transparent text-center text-ink outline-none",
            large ? "numerals text-[1.75rem]" : "tabular text-lg font-semibold",
          )}
        />
        {props.unit && (
          <span aria-hidden className="shrink-0">
            {props.unit}
          </span>
        )}
      </div>
      <StepButton
        label={t("ui.stepper.more", { label: props.label.toLowerCase() })}
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
        "flex shrink-0 items-center justify-center rounded-xl bg-surface text-ink transition-colors hover:bg-rule active:bg-rule",
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

/**
 * `h:mm:ss`, `m:ss`, or plain seconds. `.` and `,` also separate the parts:
 * phone number pads have no colon key, but the decimal pad has one of them.
 */
export function parseDuration(text: string): number | null {
  const parts = text.trim().split(/[:.,]/);
  if (parts.some((p) => p === "" || !/^\d+$/.test(p)) || parts.length > 3) {
    return null;
  }
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}
