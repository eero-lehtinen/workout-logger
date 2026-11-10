import { describe, expect, it } from "vitest";
import {
  type BundleState,
  planAfterReady,
  planUpdate,
  shellSupports,
} from "./live-update-plan.ts";

const OLD = "aaaaaaa";
const NEW = "bbbbbbb";
const OTHER = "ccccccc";

/** A shell at 1.2.0 that runs the web build in its APK. */
function state(overrides: Partial<BundleState> = {}): BundleState {
  return {
    running: OLD,
    current: null,
    next: null,
    downloaded: [],
    blocked: [],
    native: "1.2.0",
    ...overrides,
  };
}

const latest = { version: NEW, minNative: "1.2.0" };

describe("shellSupports", () => {
  it.each([
    ["1.2.0", "1.2.0", true],
    ["1.10.0", "1.9.0", true],
    ["1.2.0", "1.3.0", false],
    ["1.2.0-debug", "1.2.0", true],
    ["0.0.0", "0.4.1", false],
    ["0.0.0-debug", "0.4.1", false],
    ["1.2.0", "soon", false],
  ])("a %s shell with a build for %s: %s", (native, minNative, expected) => {
    expect(shellSupports(native, minNative)).toBe(expected);
  });
});

describe("planUpdate", () => {
  it("downloads a build the phone doesn't have", () => {
    expect(planUpdate(latest, state())).toEqual({
      action: "stage",
      bundle: NEW,
      download: true,
      remove: [],
    });
  });

  it("replaces the running bundle only on the next start, and keeps it until then", () => {
    const plan = planUpdate(
      latest,
      state({ current: OLD, next: OLD, downloaded: [OLD] }),
    );
    expect(plan).toEqual({
      action: "stage",
      bundle: NEW,
      download: true,
      remove: [],
    });
  });

  it("does nothing when the phone runs the server's build", () => {
    expect(planUpdate({ ...latest, version: OLD }, state())).toEqual({
      action: "none",
      reason: "current",
    });
    expect(
      planUpdate(
        latest,
        state({ running: NEW, current: NEW, next: NEW, downloaded: [NEW] }),
      ),
    ).toEqual({ action: "none", reason: "current" });
  });

  it("does nothing when the build already waits for the next start", () => {
    expect(planUpdate(latest, state({ next: NEW, downloaded: [NEW] }))).toEqual(
      { action: "none", reason: "staged" },
    );
  });

  it("leaves a build that needs a newer shell to the APK prompt", () => {
    expect(planUpdate({ ...latest, minNative: "1.3.0" }, state())).toEqual({
      action: "none",
      reason: "needs-newer-shell",
    });
  });

  it("never updates a local build", () => {
    expect(planUpdate(latest, state({ native: "0.0.0-debug" }))).toEqual({
      action: "none",
      reason: "needs-newer-shell",
    });
  });

  it("doesn't download a build that was rolled back", () => {
    expect(planUpdate(latest, state({ blocked: [NEW] }))).toEqual({
      action: "none",
      reason: "blocked",
    });
  });

  it("stages a build that is on the phone without downloading it again", () => {
    expect(planUpdate(latest, state({ downloaded: [NEW] }))).toEqual({
      action: "stage",
      bundle: NEW,
      download: false,
      remove: [],
    });
  });

  it("drops a staged build that the server replaced", () => {
    const plan = planUpdate(
      latest,
      state({ current: OLD, next: OTHER, downloaded: [OLD, OTHER] }),
    );
    expect(plan).toEqual({
      action: "stage",
      bundle: NEW,
      download: true,
      remove: [OTHER],
    });
  });

  it("cancels a staged build when the server went back to the running one", () => {
    expect(
      planUpdate(
        { ...latest, version: OLD },
        state({ current: OLD, next: NEW, downloaded: [OLD, NEW] }),
      ),
    ).toEqual({ action: "stage", bundle: OLD, download: false, remove: [NEW] });
    expect(
      planUpdate(
        { ...latest, version: OLD },
        state({ next: NEW, downloaded: [NEW] }),
      ),
    ).toEqual({
      action: "stage",
      bundle: null,
      download: false,
      remove: [NEW],
    });
  });

  it("updates a build that doesn't know its own version", () => {
    expect(planUpdate(latest, state({ running: undefined }))).toMatchObject({
      action: "stage",
      bundle: NEW,
    });
  });
});

describe("planAfterReady", () => {
  it("removes the bundle that the confirmed one replaced", () => {
    expect(
      planAfterReady(
        { currentBundleId: NEW, previousBundleId: OLD, rollback: false },
        { next: NEW, downloaded: [OLD, NEW], blocked: [] },
      ),
    ).toEqual({ remove: [OLD] });
  });

  it("keeps a bundle that waits for the next start", () => {
    expect(
      planAfterReady(
        { currentBundleId: OLD, previousBundleId: OLD, rollback: false },
        { next: NEW, downloaded: [OLD, NEW], blocked: [] },
      ),
    ).toEqual({ remove: [] });
  });

  it("has nothing to do on the web build in the APK", () => {
    expect(
      planAfterReady(
        { currentBundleId: null, previousBundleId: null, rollback: false },
        { next: null, downloaded: [], blocked: [] },
      ),
    ).toEqual({ remove: [] });
  });

  it("after a rollback, removes the failed bundle and stages the one before it", () => {
    expect(
      planAfterReady(
        { currentBundleId: null, previousBundleId: NEW, rollback: true },
        { next: null, downloaded: [OLD, NEW], blocked: [NEW] },
      ),
    ).toEqual({ stage: OLD, remove: [NEW] });
  });

  it("after a rollback of the only bundle, stays on the web build in the APK", () => {
    expect(
      planAfterReady(
        { currentBundleId: null, previousBundleId: NEW, rollback: true },
        { next: null, downloaded: [NEW], blocked: [NEW] },
      ),
    ).toEqual({ remove: [NEW] });
  });

  it("never falls back to a bundle that was rolled back earlier", () => {
    expect(
      planAfterReady(
        { currentBundleId: null, previousBundleId: NEW, rollback: true },
        { next: null, downloaded: [OLD, NEW], blocked: [OLD, NEW] },
      ),
    ).toEqual({ remove: [OLD, NEW] });
  });

  it("ignores a rollback report from a slow start of the APK's own build", () => {
    expect(
      planAfterReady(
        { currentBundleId: null, previousBundleId: null, rollback: true },
        { next: NEW, downloaded: [NEW], blocked: [] },
      ),
    ).toEqual({ remove: [] });
  });
});
