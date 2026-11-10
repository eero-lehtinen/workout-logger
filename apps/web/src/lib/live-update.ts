import { App } from "@capacitor/app";
import { LiveUpdate } from "@capawesome/capacitor-live-update";
import * as v from "valibot";
import { appVersion } from "./app-update.ts";
import { planAfterReady, planUpdate } from "./live-update-plan.ts";
import { isNative } from "./platform.ts";
import { SERVER_URL } from "./server.ts";

const BUNDLE_URL = `${SERVER_URL}/api/android/bundle`;

// The version becomes a directory name on the phone, and the signature
// covers only the zip, so the server must not be able to choose a path.
const Bundle = v.object({
  version: v.pipe(v.string(), v.regex(/^[0-9A-Za-z][\w.-]{0,63}$/)),
  minNative: v.string(),
  checksum: v.string(),
  signature: v.nullable(v.string()),
});

/** The server's bundle, or null when it has none. Rejects when unreachable. */
async function latestBundle(): Promise<v.InferOutput<typeof Bundle> | null> {
  const res = await fetch(BUNDLE_URL);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`The server answered ${res.status}`);
  return v.parse(Bundle, await res.json());
}

async function removeBundles(ids: readonly string[]): Promise<void> {
  for (const bundleId of ids) {
    // A leftover directory costs disk space and nothing else.
    await LiveUpdate.deleteBundle({ bundleId }).catch(() => {});
  }
}

let waiting = false;
const waitingListeners = new Set<() => void>();

function setWaiting(value: boolean) {
  if (waiting === value) return;
  waiting = value;
  for (const listener of waitingListeners) listener();
}

/** Whether a downloaded build waits to take over; for useSyncExternalStore. */
export const isUpdateWaiting = (): boolean => waiting;

export function subscribeUpdateWaiting(listener: () => void): () => void {
  waitingListeners.add(listener);
  return () => waitingListeners.delete(listener);
}

async function check(): Promise<boolean> {
  const staged = await stageLatest();
  setWaiting(staged);
  return staged;
}

async function stageLatest(): Promise<boolean> {
  const latest = await latestBundle();
  if (!latest) return false;
  const [current, next, bundles, blocked, native] = await Promise.all([
    LiveUpdate.getCurrentBundle(),
    LiveUpdate.getNextBundle(),
    LiveUpdate.getBundles(),
    LiveUpdate.getBlockedBundles(),
    appVersion(),
  ]);
  const plan = planUpdate(latest, {
    running: import.meta.env.BUILD_COMMIT || undefined,
    current: current.bundleId,
    next: next.bundleId,
    downloaded: bundles.bundleIds,
    blocked: blocked.bundleIds,
    native,
  });
  if (plan.action === "none") return plan.reason === "staged";

  if (plan.download) {
    await LiveUpdate.downloadBundle({
      url: `${BUNDLE_URL}/${latest.version}.zip`,
      bundleId: latest.version,
      checksum: latest.checksum,
      ...(latest.signature && { signature: latest.signature }),
    });
  }
  await LiveUpdate.setNextBundle({ bundleId: plan.bundle });
  await removeBundles(plan.remove);
  return plan.bundle !== current.bundleId;
}

let checking: Promise<boolean> | undefined;

/**
 * Asks the server for its web build and, if this shell can run it and
 * doesn't already, downloads it (docs/architecture.md#live-updates). Never
 * switches the running app itself: LiveUpdateSwitch does that out of sight,
 * or the next start. Resolves to whether a newer build waits to take over;
 * rejects when the server can't be reached or the download fails.
 */
export function checkForLiveUpdate(): Promise<boolean> {
  if (!isNative) return Promise.resolve(false);
  checking ??= check().finally(() => {
    checking = undefined;
  });
  return checking;
}

async function confirmBundle(): Promise<void> {
  const ready = await LiveUpdate.ready();
  const [next, bundles, blocked] = await Promise.all([
    LiveUpdate.getNextBundle(),
    LiveUpdate.getBundles(),
    LiveUpdate.getBlockedBundles(),
  ]);
  const plan = planAfterReady(ready, {
    next: next.bundleId,
    downloaded: bundles.bundleIds,
    blocked: blocked.bundleIds,
  });
  if (plan.stage) {
    await LiveUpdate.setNextBundle({ bundleId: plan.stage });
    setWaiting(true);
  }
  await removeBundles(plan.remove);
}

// Longer than the shell's rollback timeout (capacitor.config.ts), so with
// the app in front a failing bundle is rolled back, and blocked, before
// anything is downloaded. The shell's timer pauses in the background and
// this one doesn't; a check on a failing bundle then only stages the
// server's build early.
const UNCONFIRMED_CHECK_MS = 30_000;

// Android can keep the app's process for days, so a start is too rare a
// moment to be the only check.
const RESUME_CHECK_MS = 60 * 60 * 1000;

let started = false;
let confirmed = false;
let checkedOnStart = false;
let lastCheckAt = 0;

function checkQuietly() {
  lastCheckAt = Date.now();
  // Offline, most likely. The next start or resume checks again.
  checkForLiveUpdate().catch(() => {});
}

function checkOnStart() {
  if (checkedOnStart) return;
  checkedOnStart = true;
  checkQuietly();
}

/**
 * Call once when the app starts. The update check normally follows
 * `markAppReady`. If the app never gets that far, it still checks, so that
 * a fixed build can replace one that can't open the database. Later checks
 * follow the app's return to the front, at most hourly.
 */
export function startLiveUpdates(): void {
  if (!isNative || started) return;
  started = true;
  setTimeout(checkOnStart, UNCONFIRMED_CHECK_MS);
  void App.addListener("resume", () => {
    if (checkedOnStart && Date.now() - lastCheckAt > RESUME_CHECK_MS) {
      checkQuietly();
    }
  });
}

/**
 * Tells the shell that this web build works: the database is open and the
 * app has rendered, or the database belongs to a newer build, which a
 * rollback wouldn't cure. Until then the shell counts down to a rollback.
 */
export function markAppReady(): void {
  if (!isNative || confirmed) return;
  confirmed = true;
  confirmBundle()
    .catch((error) => console.error("Confirming the web build failed", error))
    .finally(checkOnStart);
}

/**
 * Switches to the waiting build by reloading the WebView, which loses what
 * is on screen. Only for moments when nothing is in progress.
 */
export async function switchToWaitingBuild(): Promise<void> {
  await LiveUpdate.reload();
}

/** Checks for a build and switches to it right away. */
export async function applyLiveUpdate(): Promise<void> {
  await checkForLiveUpdate().catch(() => {});
  await switchToWaitingBuild();
}
