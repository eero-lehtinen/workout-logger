import { clsx } from "clsx";
import { RotateCcw, X } from "lucide-react";
import { formatDuration } from "../../lib/format.ts";
import {
  type RestState,
  restTimer,
  useRestTimer,
} from "../../lib/rest-timer.ts";
import { useNow } from "../../lib/use-now.ts";

function remainingSeconds(state: RestState, now: number) {
  return Math.max(0, Math.ceil((state.endsAt - now) / 1000));
}

/** The rest countdown with its controls, for the logging screen. */
export function RestControls() {
  const state = useRestTimer();
  const now = useNow(250);
  if (!state) return null;
  const remaining = remainingSeconds(state, now);
  const progress = state.finished ? 1 : 1 - remaining / state.seconds;
  return (
    <div
      className={clsx(
        "relative flex items-center gap-1 overflow-hidden rounded-xl py-1 pr-1 pl-3",
        state.finished ? "bg-increase/15" : "bg-surface",
      )}
    >
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 bg-ink/8 transition-[width] duration-200"
        style={{ width: `${progress * 100}%` }}
      />
      <p className="relative flex-1 text-[0.9375rem]" aria-live="polite">
        {state.finished ? (
          <span className="font-semibold text-increase">Rest over</span>
        ) : (
          <>
            <span className="text-ink-muted">Rest </span>
            <span className="numerals text-xl">
              {formatDuration(remaining)}
            </span>
          </>
        )}
      </p>
      {!state.finished && (
        <>
          <RestButton onClick={() => restTimer.adjust(-15)}>−15 s</RestButton>
          <RestButton onClick={() => restTimer.adjust(15)}>+15 s</RestButton>
        </>
      )}
      <RestButton label="Restart rest" onClick={() => restTimer.restart()}>
        <RotateCcw size={17} />
      </RestButton>
      <RestButton
        label={state.finished ? "Dismiss" : "Skip rest"}
        onClick={() => restTimer.skip()}
      >
        <X size={18} />
      </RestButton>
    </div>
  );
}

function RestButton(props: {
  children: React.ReactNode;
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className="relative flex h-10 min-w-10 items-center justify-center rounded-lg px-2 text-sm font-semibold tabular hover:bg-ink/8"
    >
      {props.children}
    </button>
  );
}

/** A compact countdown floating over other screens. */
export function RestBar() {
  const state = useRestTimer();
  const now = useNow(500);
  if (!state) return null;
  return (
    <div className="fixed right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-1 rounded-full bg-float py-1 pr-1 pl-4 text-on-float shadow-lg lg:right-6 lg:bottom-6">
      <span className="text-sm" aria-live="polite">
        {state.finished ? (
          "Rest over"
        ) : (
          <>
            Rest{" "}
            <span className="numerals text-base">
              {formatDuration(remainingSeconds(state, now))}
            </span>
          </>
        )}
      </span>
      <button
        type="button"
        aria-label={state.finished ? "Dismiss" : "Skip rest"}
        onClick={() => restTimer.skip()}
        className="flex size-8 items-center justify-center rounded-full hover:bg-on-float/15"
      >
        <X size={16} />
      </button>
    </div>
  );
}
