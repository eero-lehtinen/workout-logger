import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { openTestApp } from "./testing.ts";

const webRoot = mkdtempSync(join(tmpdir(), "wl-server-"));
const files: Record<string, string> = {
  "index.html": "<!doctype html><title>app</title>",
  "sw.js": "self.addEventListener('install', () => {});",
  "workbox-2fbc6a65.js": "// workbox",
  "manifest.webmanifest": "{}",
  "favicon.svg": "<svg></svg>",
  "assets/index-CoxwjCZ-.js": "console.log(1);",
  "assets/sqlite3-k2cTanUO.wasm": "\0asm",
};
mkdirSync(join(webRoot, "assets"));
for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(webRoot, name), content);
}
afterAll(() => rmSync(webRoot, { recursive: true, force: true }));

const { app } = await openTestApp({ webRoot, commit: "abc123" });

describe("static files", () => {
  it.each([
    ["/", "text/html"],
    ["/index.html", "text/html"],
    ["/sw.js", "text/javascript"],
    ["/workbox-2fbc6a65.js", "text/javascript"],
    ["/manifest.webmanifest", "application/manifest+json"],
    ["/favicon.svg", "image/svg+xml"],
  ])("revalidates %s on every load", async (path, type) => {
    const res = await app.request(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain(type);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  it("caches hashed assets forever", async () => {
    const res = await app.request("/assets/index-CoxwjCZ-.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(await res.text()).toBe(files["assets/index-CoxwjCZ-.js"]);
  });

  it("serves wasm as application/wasm", async () => {
    const res = await app.request("/assets/sqlite3-k2cTanUO.wasm");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/wasm");
  });

  it("answers a missing asset with 404, not index.html", async () => {
    const res = await app.request("/assets/index-old.js");
    expect(res.status).toBe(404);
  });

  it("falls back to index.html for client-side routes", async () => {
    const res = await app.request(
      "/sessions/0193e0a0-0000-7000-8000-000000000000",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toBe(files["index.html"]);
  });

  it("refuses paths that escape the web root", async () => {
    const res = await app.request("/..%2f..%2fetc/passwd");
    expect(await res.text()).toBe(files["index.html"]);
  });

  it("sets nosniff", async () => {
    const res = await app.request("/");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("/api", () => {
  it("reports the version and commit", async () => {
    const res = await app.request("/api/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      version: pkg.version,
      commit: "abc123",
      backupsOk: true,
    });
  });

  it("reports a null commit when none was built in", async () => {
    const { app } = await openTestApp({ webRoot });
    const res = await app.request("/api/status");
    expect(await res.json()).toMatchObject({ commit: null });
  });

  it("never falls back to index.html", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it.each(["/api/status", "/api/nope"])("is never cached: %s", async (path) => {
    const res = await app.request(path);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
