import { Link } from "@tanstack/react-router";
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

const PILL =
  "fixed right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex h-11 items-center rounded-full border border-rule bg-raised p-1 text-sm text-ink shadow-lg lg:right-6 lg:bottom-6";

/**
 * A compact countdown floating over other screens. Tapping it opens the
 * exercise the rest belongs to; opening a finished rest also dismisses it.
 */
export function RestBar() {
  const state = useRestTimer();
  if (!state) return null;
  const label = <RestLabel state={state} />;
  const target = "flex h-full items-center rounded-full px-3 hover:bg-surface";
  return (
    <div className={PILL}>
      {state.for ? (
        <Link
          to="/sessions/$sessionId/$sessionExerciseId"
          params={state.for}
          onClick={() => {
            if (state.finished) restTimer.skip();
          }}
          className={target}
        >
          {label}
        </Link>
      ) : state.finished ? (
        <button
          type="button"
          onClick={() => restTimer.skip()}
          className={target}
        >
          {label}
        </button>
      ) : (
        <span className="px-3">{label}</span>
      )}
      <button
        type="button"
        aria-label={state.finished ? "Dismiss" : "Skip rest"}
        onClick={() => restTimer.skip()}
        className="flex size-9 items-center justify-center rounded-full hover:bg-surface"
      >
        <X size={16} />
      </button>
    </div>
  );
}

function RestLabel({ state }: { state: RestState }) {
  const now = useNow(500);
  if (state.finished) {
    return (
      <span className="font-semibold" aria-live="polite">
        Rest over
      </span>
    );
  }
  return (
    <span aria-live="polite">
      Rest{" "}
      <span className="numerals text-base">
        {formatDuration(remainingSeconds(state, now))}
      </span>
    </span>
  );
}
