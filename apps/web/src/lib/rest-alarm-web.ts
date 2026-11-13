import type { AlarmRest, RestAlarm, RestAlarmHost } from "./rest-alarm.ts";
import beepUrl from "./rest-beep.wav?url";

/**
 * The in-page alarm: a timeout, then Web Audio and vibration. It alerts only
 * while the page is visible; browsers throttle or freeze hidden pages.
 */
export class WebRestAlarm implements RestAlarm {
  #host: RestAlarmHost | undefined;
  #endsAt: number | null = null;
  #timeout: ReturnType<typeof setTimeout> | undefined;
  #audio: AudioContext | undefined;
  #sound: Promise<AudioBuffer | undefined> | undefined;
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
    void this.#beep(this.#volume);
    this.#host?.finished();
  }

  /** Browsers only let audio start from a user gesture. */
  #unlockAudio() {
    try {
      this.#audio ??= new AudioContext();
      void this.#audio.resume();
    } catch {
      this.#audio = undefined;
      return;
    }
    this.#sound ??= this.#loadSound(this.#audio);
  }

  async #loadSound(audio: AudioContext): Promise<AudioBuffer | undefined> {
    try {
      const response = await fetch(beepUrl);
      return await audio.decodeAudioData(await response.arrayBuffer());
    } catch {
      // Retried on the next arm or preview.
      this.#sound = undefined;
      return undefined;
    }
  }

  /** The same sound as the Android app's, scaled like its player volume. */
  async #beep(volume: number) {
    const audio = this.#audio;
    const sound = await this.#sound;
    if (!audio || !sound || audio.state !== "running") return;
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    source.buffer = sound;
    gain.gain.value = volume;
    source.connect(gain).connect(audio.destination);
    source.start();
  }
}
