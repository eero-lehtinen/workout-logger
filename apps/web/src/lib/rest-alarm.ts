export interface RestFor {
  sessionId: string;
  sessionExerciseId: string;
}

export interface RestState {
  endsAt: number;
  /** The full rest, for restart and progress. */
  seconds: number;
  finished: boolean;
  /** The session exercise whose set started the rest. */
  for: RestFor | null;
}

/**
 * The `rest_alert_volume` setting as a gain. Steps are far apart because
 * loudness follows the gain's logarithm.
 */
export const ALERT_VOLUMES = { low: 0.12, medium: 0.35, high: 1 } as const;

/** A rest as the alarm knows it: when it ends and whether it has. */
export interface AlarmRest {
  endsAt: number;
  finished: boolean;
}

/** What an alarm reports back to the rest timer. */
export interface RestAlarmHost {
  /** The rest ended and the alert was given. */
  finished(): void;
  /**
   * The alarm's own view of the rest, where it can change without the page:
   * the Android notification's buttons, or a rest that ended while the
   * WebView was gone. `null` means there is no rest.
   */
  synced(rest: AlarmRest | null): void;
  /** The alarm couldn't be armed, so there will be no alert. */
  failed(): void;
}

/**
 * What alerts at the end of a rest: in-page on the web, the RestTimer plugin
 * on Android (docs/architecture.md#rest-timer).
 */
export interface RestAlarm {
  /** `rest` is the rest restored from storage, if one is counting down. */
  connect(host: RestAlarmHost, rest: AlarmRest | null): void;
  /**
   * Call from a user gesture: sound and the Android service both need it.
   * `volume` is 0..1; without it the alarm keeps the volume it had.
   */
  arm(endsAt: number, volume?: number): void;
  disarm(): void;
  /** Plays the alert's sound once at `volume`. Call from a user gesture. */
  preview(volume: number): void;
}

/**
 * The rest to show after the alarm reports its view. The alarm decides when
 * the rest ends and whether it has; the page only knows what it was for.
 */
export function mergeAlarmRest(
  state: RestState | null,
  rest: AlarmRest | null,
  now: number,
): RestState | null {
  if (!rest) return null;
  return {
    endsAt: rest.endsAt,
    finished: rest.finished,
    // Unknown when the page lost its state but the alarm kept counting.
    seconds:
      state?.seconds ?? Math.max(1, Math.round((rest.endsAt - now) / 1000)),
    for: state?.for ?? null,
  };
}
