import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { openTestApp } from "./testing.ts";

const bundleRoot = mkdtempSync(join(tmpdir(), "wl-bundle-"));
const emptyRoot = mkdtempSync(join(tmpdir(), "wl-bundle-"));
afterAll(() => {
  rmSync(bundleRoot, { recursive: true, force: true });
  rmSync(emptyRoot, { recursive: true, force: true });
});

const MANIFEST = {
  version: "0123abc",
  minNative: "1.2.0",
  checksum: "c0ffee",
  signature: "c2lnbmF0dXJl",
};
const ZIP = "PK\u0003\u0004 not really a zip";
writeFileSync(join(bundleRoot, "manifest.json"), JSON.stringify(MANIFEST));
writeFileSync(join(bundleRoot, "bundle.zip"), ZIP);

const { app } = await openTestApp({ bundleRoot });

describe("/api/android/bundle", () => {
  it("reports the bundle to the app's origin, without a release token", async () => {
    const res = await app.request("/api/android/bundle", {
      headers: { origin: "https://localhost" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(MANIFEST);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://localhost",
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("serves the zip of the reported version", async () => {
    const res = await app.request("/api/android/bundle/0123abc.zip");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe(ZIP);
  });

  it("has no zip for a version it no longer serves", async () => {
    const res = await app.request("/api/android/bundle/fedcba9.zip");
    expect(res.status).toBe(404);
  });

  it.each(["/api/android/bundle", "/api/android/bundle/0123abc.zip"])(
    "answers 404 when the build has no bundle: %s",
    async (path) => {
      const { app } = await openTestApp({ bundleRoot: emptyRoot });
      const res = await app.request(path);
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");
    },
  );

  it("answers 500 for a manifest it can't read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = mkdtempSync(join(tmpdir(), "wl-bundle-"));
    writeFileSync(join(broken, "manifest.json"), "{");
    const { app } = await openTestApp({ bundleRoot: broken });
    const res = await app.request("/api/android/bundle");
    expect(res.status).toBe(500);
    rmSync(broken, { recursive: true, force: true });
    error.mockRestore();
  });

  it("leaves the APK endpoints as they were", async () => {
    const res = await app.request("/api/android/latest");
    expect(res.status).toBe(503);
  });
});
