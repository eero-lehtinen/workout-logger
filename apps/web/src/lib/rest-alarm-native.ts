import { type PluginListenerHandle, registerPlugin } from "@capacitor/core";
import type { RestAlarm, RestAlarmHost } from "./rest-alarm.ts";

type PermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "prompt-with-rationale";

/** RestTimerPlugin.kt in apps/android. Times are epoch milliseconds. */
interface RestTimerPlugin {
  /** Rejects when Android refuses the service: the app isn't visible. */
  start(options: { endsAt: number; volume?: number }): Promise<void>;
  cancel(): Promise<void>;
  preview(options: { volume: number }): Promise<void>;
  getState(): Promise<{ endsAt?: number; finished?: boolean }>;
  notificationPermission(): Promise<{ state: PermissionState }>;
  requestNotificationPermission(): Promise<{ state: PermissionState }>;
  addListener(
    event: "finished" | "adjusted" | "cancelled",
    listener: (event: { endsAt: number }) => void,
  ): Promise<PluginListenerHandle>;
}

const plugin = registerPlugin<RestTimerPlugin>("RestTimer");

/**
 * The Android alarm: a foreground service counts down and alerts, also with
 * the app in the background or the screen locked.
 */
export class NativeRestAlarm implements RestAlarm {
  #host: RestAlarmHost | undefined;
  /** Plugin calls run one at a time, in the order they were made. */
  #calls: Promise<unknown> = Promise.resolve();
  /** Counts arms and disarms, to drop a state read that one of them outdated. */
  #changes = 0;
  #askedPermission = false;

  connect(host: RestAlarmHost) {
    this.#host = host;
    void plugin.addListener("finished", () => host.finished());
    // The notification's "+15 s" and "Skip".
    void plugin.addListener("adjusted", ({ endsAt }) =>
      host.synced({ endsAt, finished: false }),
    );
    void plugin.addListener("cancelled", () => host.synced(null));
    // Events don't reach a WebView that wasn't running, so ask on return.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.#sync();
    });
    this.#sync();
  }

  arm(endsAt: number, volume?: number) {
    this.#changes++;
    this.#enqueue(async () => {
      await this.#askPermissionOnce();
      try {
        await plugin.start({
          endsAt: Math.round(endsAt),
          ...(volume !== undefined && { volume }),
        });
      } catch {
        this.#host?.failed();
      }
    });
  }

  disarm() {
    this.#changes++;
    this.#enqueue(() => plugin.cancel());
  }

  preview(volume: number) {
    this.#enqueue(() => plugin.preview({ volume }));
  }

  #sync() {
    const changes = this.#changes;
    this.#enqueue(async () => {
      const { endsAt, finished } = await plugin.getState();
      if (changes !== this.#changes) return;
      this.#host?.synced(
        endsAt === undefined ? null : { endsAt, finished: finished === true },
      );
    });
  }

  #enqueue(call: () => Promise<unknown>) {
    this.#calls = this.#calls.then(call).catch((error) => {
      console.error("rest timer plugin call failed", error);
    });
  }

  /**
   * Without the permission the countdown and the alert still run, but no
   * notification shows. Asked on the first rest, and only if Android would
   * show its dialog: a user who refused isn't asked again.
   */
  async #askPermissionOnce() {
    if (this.#askedPermission) return;
    this.#askedPermission = true;
    try {
      const { state } = await plugin.notificationPermission();
      if (state === "prompt") await plugin.requestNotificationPermission();
    } catch (error) {
      console.error("notification permission request failed", error);
    }
  }
}
