import { execFileSync } from "node:child_process";

/**
 * The oldest Android shell (APK version) this web build runs in. Raise it to
 * the next release's version in the change that makes the web code call
 * something only that APK has: a new plugin, a new `RestTimer` method. Older
 * shells then keep their web build and get the APK prompt instead
 * (docs/deployment.md#live-updates).
 */
export const MIN_NATIVE = "0.4.1";

/**
 * The commit this build is from: shown in Settings, and the version of the
 * live-update bundle, so the app and the bundle's manifest must get it from
 * here. The Docker build gets it as GIT_COMMIT (the image has no .git), the
 * APK build as GITHUB_SHA. Undefined when it can't be determined.
 */
export function buildCommit(): string | undefined {
  const fromEnv = process.env.GIT_COMMIT || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}
