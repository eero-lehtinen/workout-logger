import { useSyncExternalStore } from "react";
import { toasts } from "../components/toasts.tsx";
import { isNative } from "./platform.ts";
import {
  type AlarmRest,
  mergeAlarmRest,
  type RestAlarm,
  type RestFor,
  type RestState,
} from "./rest-alarm.ts";
import { NativeRestAlarm } from "./rest-alarm-native.ts";
import { WebRestAlarm } from "./rest-alarm-web.ts";

export type { RestFor, RestState };

const STORAGE_KEY = "rest-timer";
const MAX_SECONDS = 60 * 60;
/** How long "Rest over" stays up before it clears itself. */
export const FINISHED_VISIBLE_MS = 60_000;

/**
 * The rest countdown shown in the UI. The alert at its end comes from the
 * alarm: in-page on the web, a foreground service on Android
 * (docs/architecture.md#rest-timer).
 */
class RestTimer {
  #state: RestState | null = load();
  #listeners = new Set<() => void>();
  #alarm: RestAlarm;
  #clearTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(alarm: RestAlarm) {
    this.#alarm = alarm;
    if (
      this.#state &&
      !this.#state.finished &&
      this.#state.endsAt <= Date.now()
    ) {
      // Ended while the page was closed: show it as over, without an alert.
      this.#set({ ...this.#state, finished: true });
    }
    alarm.connect(
      {
        finished: () => this.#finish(),
        synced: (rest) => this.#sync(rest),
        failed: () => this.#startFailed(),
      },
      this.#state,
    );
    this.#scheduleClear();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.#scheduleClear();
    });
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getState = () => this.#state;

  /** Call from a user gesture; see RestAlarm.arm. */
  start(seconds: number, restFor: RestFor | null, volume?: number) {
    if (seconds <= 0) {
      this.skip();
      return;
    }
    const endsAt = Date.now() + seconds * 1000;
    this.#set({ endsAt, seconds, finished: false, for: restFor });
    this.#alarm.arm(endsAt, volume);
  }

  adjust(deltaSeconds: number) {
    const state = this.#state;
    if (!state || state.finished) return;
    const remaining = state.endsAt - Date.now() + deltaSeconds * 1000;
    const endsAt =
      Date.now() + Math.min(Math.max(remaining, 0), MAX_SECONDS * 1000);
    this.#set({ ...state, endsAt });
    this.#alarm.arm(endsAt);
  }

  restart() {
    if (this.#state) this.start(this.#state.seconds, this.#state.for);
  }

  skip() {
    this.#alarm.disarm();
    this.#set(null);
  }

  /** Plays the alert's sound once at `volume` (0..1). Call from a user gesture. */
  previewAlert(volume: number) {
    this.#alarm.preview(volume);
  }

  #finish() {
    if (!this.#state || this.#state.finished) return;
    this.#set({ ...this.#state, finished: true });
  }

  #sync(rest: AlarmRest | null) {
    const state = this.#state;
    if (state?.endsAt === rest?.endsAt && state?.finished === rest?.finished) {
      return;
    }
    this.#set(mergeAlarmRest(state, rest, Date.now()));
  }

  #startFailed() {
    this.#set(null);
    toasts.add({
      title: "The rest timer didn't start",
      description: "Android only starts it while the app is open.",
      type: "error",
    });
  }

  /** A finished rest clears itself after FINISHED_VISIBLE_MS. */
  #scheduleClear() {
    clearTimeout(this.#clearTimeout);
    const state = this.#state;
    if (!state?.finished) return;
    const delay = state.endsAt + FINISHED_VISIBLE_MS - Date.now();
    if (delay <= 0) this.skip();
    else this.#clearTimeout = setTimeout(() => this.skip(), delay);
  }

  #set(state: RestState | null) {
    this.#state = state;
    save(state);
    this.#scheduleClear();
    for (const listener of this.#listeners) listener();
  }
}

function load(): RestState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<RestState>;
    if (typeof value.endsAt !== "number" || typeof value.seconds !== "number") {
      return null;
    }
    const restFor = value.for;
    return {
      endsAt: value.endsAt,
      seconds: value.seconds,
      finished: Boolean(value.finished),
      for:
        typeof restFor?.sessionId === "string" &&
        typeof restFor.sessionExerciseId === "string"
          ? {
              sessionId: restFor.sessionId,
              sessionExerciseId: restFor.sessionExerciseId,
            }
          : null,
    };
  } catch {
    return null;
  }
}

function save(state: RestState | null) {
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable; the timer still runs for this page.
  }
}

export const restTimer = new RestTimer(
  isNative ? new NativeRestAlarm() : new WebRestAlarm(),
);

export function useRestTimer(): RestState | null {
  return useSyncExternalStore(restTimer.subscribe, restTimer.getState);
}
