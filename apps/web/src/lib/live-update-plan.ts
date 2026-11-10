import { compareVersions } from "compare-versions";

/** The server's bundle, as `/api/android/bundle` reports it. */
export interface LatestBundle {
  /** The commit of the web build; also the bundle's id on the phone. */
  version: string;
  /** The oldest shell (APK version) the build runs in. */
  minNative: string;
}

/** What the phone has, as the live-update plugin reports it. */
export interface BundleState {
  /** The web version of the running code; undefined for a build without one. */
  running: string | undefined;
  /** The bundle the app runs; null for the web build in the APK. */
  current: string | null;
  /** The bundle the next start runs; equals `current` when nothing waits. */
  next: string | null;
  /** Every bundle on the phone. */
  downloaded: readonly string[];
  /** Bundles that failed to start and were rolled back. */
  blocked: readonly string[];
  /** The shell's versionName, e.g. "1.2.3" or "1.2.3-debug". */
  native: string;
}

export type UpdatePlan =
  | {
      action: "none";
      reason: "current" | "staged" | "blocked" | "needs-newer-shell";
    }
  /** Run `bundle` on the next start, downloading it first if `download`. */
  | {
      action: "stage";
      bundle: string | null;
      download: boolean;
      /** Bundles nothing refers to after that. */
      remove: string[];
    };

const CORE_VERSION = /^\d+\.\d+\.\d+/;

/**
 * Whether a shell at `native` has what a web build asks for. Suffixes are
 * ignored, so a debug build (`1.2.3-debug`) counts as its version. Local
 * builds are 0.0.0 and never qualify: they keep the web build they carry.
 */
export function shellSupports(native: string, minNative: string): boolean {
  const have = CORE_VERSION.exec(native)?.[0];
  const need = CORE_VERSION.exec(minNative)?.[0];
  if (!have || !need) return false;
  return compareVersions(have, need) >= 0;
}

/**
 * What to do about the server's bundle. Versions are commits, so they are
 * compared for equality only: the phone follows whatever the server serves,
 * also back to an older build after a server rollback.
 */
export function planUpdate(
  latest: LatestBundle,
  state: BundleState,
): UpdatePlan {
  const stage = (bundle: string | null, download: boolean): UpdatePlan => ({
    action: "stage",
    bundle,
    download,
    remove: state.downloaded.filter(
      (id) => id !== state.current && id !== bundle,
    ),
  });

  if (latest.version === state.running) {
    // Something else waits for the next start, from before the server went
    // back to this build.
    if (state.next !== state.current) return stage(state.current, false);
    return { action: "none", reason: "current" };
  }
  if (state.blocked.includes(latest.version)) {
    return { action: "none", reason: "blocked" };
  }
  if (!shellSupports(state.native, latest.minNative)) {
    return { action: "none", reason: "needs-newer-shell" };
  }
  if (state.next === latest.version) {
    return { action: "none", reason: "staged" };
  }
  return stage(latest.version, !state.downloaded.includes(latest.version));
}

/** What the plugin's `ready()` reports. */
export interface ReadyResult {
  currentBundleId: string | null;
  /** After a rollback: the bundle that failed. */
  previousBundleId: string | null;
  rollback: boolean;
}

/**
 * Housekeeping once the running build has proven itself. The plugin rolls a
 * failed bundle back to the web build in the APK, which may be much older
 * than the bundle that ran before. That one is still on the phone, so it is
 * staged again.
 */
export function planAfterReady(
  ready: ReadyResult,
  state: Pick<BundleState, "next" | "downloaded" | "blocked">,
): { stage?: string; remove: string[] } {
  const failed = ready.rollback ? ready.previousBundleId : null;
  const usable = (id: string) => id !== failed && !state.blocked.includes(id);
  const fallback =
    failed !== null && ready.currentBundleId === null
      ? state.downloaded.find(usable)
      : undefined;
  const keep = [ready.currentBundleId, state.next, fallback].filter(
    (id): id is string => id != null && usable(id),
  );
  return {
    ...(fallback !== undefined && { stage: fallback }),
    remove: state.downloaded.filter((id) => !keep.includes(id)),
  };
}
