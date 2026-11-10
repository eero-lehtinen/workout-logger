import type { AlarmRest, RestAlarm, RestAlarmHost } from "./rest-alarm.ts";

/**
 * The in-page alarm: a timeout, then Web Audio and vibration. It alerts only
 * while the page is visible; browsers throttle or freeze hidden pages.
 */
export class WebRestAlarm implements RestAlarm {
  #host: RestAlarmHost | undefined;
  #endsAt: number | null = null;
  #timeout: ReturnType<typeof setTimeout> | undefined;
  #audio: AudioContext | undefined;
  #volume = 1;

  connect(host: RestAlarmHost, rest: AlarmRest | null) {
    this.#host = host;
    if (rest && !rest.finished) {
      this.#endsAt = rest.endsAt;
      this.#schedule();
    }
    // A hidden page's timeout can fire late; recheck on return.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.#schedule();
    });
  }

  arm(endsAt: number, volume?: number) {
    if (volume !== undefined) this.#volume = volume;
    this.#unlockAudio();
    this.#endsAt = endsAt;
    this.#schedule();
  }

  disarm() {
    clearTimeout(this.#timeout);
    this.#endsAt = null;
  }

  #schedule() {
    clearTimeout(this.#timeout);
    if (this.#endsAt === null) return;
    const delay = this.#endsAt - Date.now();
    if (delay <= 0) this.#finish();
    else this.#timeout = setTimeout(() => this.#finish(), delay);
  }

  preview(volume: number) {
    this.#unlockAudio();
    // The context starts suspended; the beep needs it running.
    void this.#audio?.resume().then(() => this.#beep(volume));
  }

  #finish() {
    this.#endsAt = null;
    navigator.vibrate?.([250, 120, 250, 120, 400]);
    this.#beep(this.#volume);
    this.#host?.finished();
  }

  /** Browsers only let audio start from a user gesture. */
  #unlockAudio() {
    try {
      this.#audio ??= new AudioContext();
      void this.#audio.resume();
    } catch {
      this.#audio = undefined;
    }
  }

  #beep(volume: number) {
    const audio = this.#audio;
    if (audio?.state !== "running") return;
    const start = audio.currentTime + 0.02;
    for (const [i, frequency] of [880, 880, 1175].entries()) {
      const t = start + i * 0.22;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.4 * volume, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }
}
