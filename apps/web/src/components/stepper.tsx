import { usePressAndHold } from "@base-ui/react/internals/usePressAndHold";
import { clsx } from "clsx";
import { Minus, Plus } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
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
 * gets the width a label column would take. The number's column is as wide
 * as its text, set by an invisible copy, between two equal flexible columns,
 * so it is centered in the field whatever the label's and unit's widths. When
 * a long label leaves no room for that, the number moves off center instead
 * of being cut off. The unit is a second label so that tapping either side
 * of the number focuses the field; `aria-labelledby` keeps it out of the
 * field's name.
 * While the field has focus it shows the typed text; otherwise `format`.
 * The first character typed after focusing replaces the value, like a
 * select-all, without selecting: on phones a selection brings up handles and
 * the copy/paste bar over the entry panel. Until then a highlight drawn
 * behind the number looks like the selection would.
 */
export function Stepper(props: StepperProps) {
  const { t } = useTranslation();
  const id = useId();
  const labelId = `${id}-label`;
  const format = props.format ?? String;
  const parse = props.parse ?? parseNumber;
  const [draft, setDraft] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const text = draft ?? (props.value === null ? "" : format(props.value));
  const large = props.size !== "md";
  const font = large
    ? "numerals text-[1.75rem]"
    : "tabular text-lg font-semibold";

  // A held button steps from timers set up at pointer down, so it reads the
  // props of the latest render rather than the ones it was created with.
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  const press = (direction: 1 | -1) => {
    const { value, step, onChange } = latest.current;
    const next = step(value ?? 0, direction);
    setDraft(null);
    onChange(next);
    return next !== value;
  };

  return (
    <div className="flex items-center gap-2">
      <StepButton
        label={t("ui.stepper.less", { label: props.label.toLowerCase() })}
        large={large}
        onStep={() => press(-1)}
      >
        <Minus size={large ? 22 : 18} />
      </StepButton>
      <div
        className={clsx(
          "grid min-w-0 flex-1 grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2 rounded-xl bg-raised px-3 text-ink-muted ring-1 ring-rule focus-within:ring-2 focus-within:ring-ink",
          large ? "h-14 text-sm" : "h-11 text-xs",
        )}
      >
        <label
          id={labelId}
          htmlFor={id}
          className="flex h-full items-center whitespace-nowrap"
        >
          {props.label}
          {props.unit && (
            <span className="sr-only">
              {" "}
              {t("ui.stepper.inUnit", { unit: props.unit })}
            </span>
          )}
        </label>
        <span className={clsx("relative h-full px-0.5", font)}>
          <span aria-hidden className="invisible whitespace-pre">
            {text || " "}
          </span>
          {fresh && text !== "" && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <span
                data-testid="stepper-replace-hint"
                className="shrink-0 rounded-md bg-rule px-1.5 text-transparent"
              >
                {text}
              </span>
            </span>
          )}
          <input
            id={id}
            aria-labelledby={labelId}
            type="text"
            inputMode={props.inputMode ?? "decimal"}
            autoComplete="off"
            enterKeyHint="done"
            value={text}
            onFocus={() => {
              setDraft(text);
              setFresh(true);
            }}
            onChange={(e) => {
              const input = e.nativeEvent as InputEvent;
              const typed = input.inputType?.startsWith("insert")
                ? input.data
                : null;
              const next = fresh
                ? replaceOnInsert(text, e.target.value, typed)
                : e.target.value;
              setFresh(false);
              setDraft(next);
              props.onChange(parse(next));
            }}
            onBlur={() => {
              setDraft(null);
              setFresh(false);
            }}
            className="absolute inset-0 size-full bg-transparent text-center text-ink outline-none"
          />
        </span>
        <label
          htmlFor={id}
          aria-hidden
          className="flex h-full items-center justify-end whitespace-nowrap"
        >
          {props.unit}
        </label>
      </div>
      <StepButton
        label={t("ui.stepper.more", { label: props.label.toLowerCase() })}
        large={large}
        onStep={() => press(1)}
      >
        <Plus size={large ? 22 : 18} />
      </StepButton>
    </div>
  );
}

const REPEAT_TICK_MS = 50;

/**
 * Steps once on press and repeats while held. Base UI's hook steps on pointer
 * down instead of click, ignores touches that turn into a scroll, and blocks
 * the long-press context menu; keyboard clicks still step once.
 * `onStep` returns false when the value can't move further, which ends the hold.
 */
function StepButton(props: {
  label: string;
  large: boolean;
  onStep: () => boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const ticks = useRef(0);
  // The hook ends a hold only on pointerup or movement, but the browser
  // sends pointercancel instead when it takes over the touch.
  const cancelled = useRef(false);
  const { pointerHandlers, shouldSkipClick } = usePressAndHold({
    disabled: false,
    elementRef: ref,
    tickDelay: REPEAT_TICK_MS,
    tick: () => {
      if (cancelled.current) return false;
      return isRepeatStep(ticks.current++) ? props.onStep() : true;
    },
  });

  return (
    <button
      ref={ref}
      type="button"
      aria-label={props.label}
      {...pointerHandlers}
      onPointerDown={(e) => {
        ticks.current = 0;
        cancelled.current = false;
        pointerHandlers.onPointerDown(e);
      }}
      onPointerCancel={() => {
        cancelled.current = true;
      }}
      onMouseEnter={(e) => {
        ticks.current = 0;
        pointerHandlers.onMouseEnter(e);
      }}
      onClick={(e) => {
        if (!shouldSkipClick(e)) props.onStep();
      }}
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-xl bg-surface text-ink transition-colors select-none hover:bg-rule active:bg-rule",
        props.large ? "size-14" : "size-11",
      )}
    >
      {props.children}
    </button>
  );
}

/**
 * Whether the hold's `tick`th tick steps. Tick 0 is the press; the hook
 * waits 400 ms and then ticks every `REPEAT_TICK_MS`, so tick 1 comes
 * 450 ms after the press. Repeats start slow enough to stop on a value
 * and speed up the longer the button is held: every 150 ms for the first
 * second, every 100 ms for the next, then every tick.
 */
export function isRepeatStep(tick: number): boolean {
  if (tick === 0) return true;
  const repeat = tick - 1;
  const every = repeat < 20 ? 3 : repeat < 40 ? 2 : 1;
  return repeat % every === 0;
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
