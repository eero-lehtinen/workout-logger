import { useSyncExternalStore } from "react";

/**
 * The web rest timer: in-page only, so it alerts only while the page is
 * visible (docs/architecture.md#rest-timer). Android replaces this with the
 * RestTimer plugin in phase 5.
 */
export interface RestState {
  endsAt: number;
  /** The full rest, for restart and progress. */
  seconds: number;
  finished: boolean;
}

const STORAGE_KEY = "rest-timer";
const MAX_SECONDS = 60 * 60;

class RestTimer {
  #state: RestState | null = load();
  #listeners = new Set<() => void>();
  #timeout: ReturnType<typeof setTimeout> | undefined;
  #audio: AudioContext | undefined;

  constructor() {
    if (this.#state && !this.#state.finished) {
      if (this.#state.endsAt <= Date.now()) {
        // Ended while the page was closed: show it as over, without an alert.
        this.#set({ ...this.#state, finished: true });
      } else {
        this.#schedule();
      }
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.#schedule();
    });
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getState = () => this.#state;

  /** Call from a user gesture, so audio is allowed to play at the end. */
  start(seconds: number) {
    this.#unlockAudio();
    if (seconds <= 0) {
      this.skip();
      return;
    }
    this.#set({
      endsAt: Date.now() + seconds * 1000,
      seconds,
      finished: false,
    });
    this.#schedule();
  }

  adjust(deltaSeconds: number) {
    const state = this.#state;
    if (!state || state.finished) return;
    const remaining = state.endsAt - Date.now() + deltaSeconds * 1000;
    const endsAt =
      Date.now() + Math.min(Math.max(remaining, 0), MAX_SECONDS * 1000);
    this.#set({ ...state, endsAt });
    this.#schedule();
  }

  restart() {
    if (this.#state) this.start(this.#state.seconds);
  }

  skip() {
    clearTimeout(this.#timeout);
    this.#set(null);
  }

  #schedule() {
    clearTimeout(this.#timeout);
    const state = this.#state;
    if (!state || state.finished) return;
    const delay = state.endsAt - Date.now();
    if (delay <= 0) {
      this.#finish();
      return;
    }
    this.#timeout = setTimeout(() => this.#finish(), delay);
  }

  #finish() {
    if (!this.#state || this.#state.finished) return;
    this.#set({ ...this.#state, finished: true });
    this.#alert();
  }

  #unlockAudio() {
    try {
      this.#audio ??= new AudioContext();
      void this.#audio.resume();
    } catch {
      this.#audio = undefined;
    }
  }

  #alert() {
    navigator.vibrate?.([250, 120, 250, 120, 400]);
    const audio = this.#audio;
    if (audio?.state !== "running") return;
    const start = audio.currentTime + 0.02;
    for (const [i, frequency] of [880, 880, 1175].entries()) {
      const t = start + i * 0.22;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  #set(state: RestState | null) {
    this.#state = state;
    save(state);
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
    return {
      endsAt: value.endsAt,
      seconds: value.seconds,
      finished: Boolean(value.finished),
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

export const restTimer = new RestTimer();

export function useRestTimer(): RestState | null {
  return useSyncExternalStore(restTimer.subscribe, restTimer.getState);
}
