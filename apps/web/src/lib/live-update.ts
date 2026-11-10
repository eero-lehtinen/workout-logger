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

async function check(): Promise<boolean> {
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
 * doesn't already, downloads it for the next start
 * (docs/architecture.md#live-updates). Never switches
 * the running app. Resolves to whether a newer build waits for the next
 * start; rejects when the server can't be reached or the download fails.
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
  if (plan.stage) await LiveUpdate.setNextBundle({ bundleId: plan.stage });
  await removeBundles(plan.remove);
}

// Longer than the shell's rollback timeout (capacitor.config.ts), so a
// failing bundle is rolled back, and blocked, before anything is downloaded.
const UNCONFIRMED_CHECK_MS = 30_000;

let started = false;
let confirmed = false;
let checkedOnStart = false;

function checkOnStart() {
  if (checkedOnStart) return;
  checkedOnStart = true;
  // Offline, most likely. The next start checks again.
  checkForLiveUpdate().catch(() => {});
}

/**
 * Call once when the app starts. The update check normally follows
 * `markAppReady`. If the app never gets that far, it still checks, so that
 * a fixed build can replace one that can't open the database.
 */
export function startLiveUpdates(): void {
  if (!isNative || started) return;
  started = true;
  setTimeout(checkOnStart, UNCONFIRMED_CHECK_MS);
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
 * Switches to a downloaded build right away by reloading the WebView. Only
 * for screens where nothing is in progress.
 */
export async function applyLiveUpdate(): Promise<void> {
  await checkForLiveUpdate().catch(() => {});
  await LiveUpdate.reload();
}
