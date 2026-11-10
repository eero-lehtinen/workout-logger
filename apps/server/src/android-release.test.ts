import { describe, expect, it, vi } from "vitest";
import { githubReleases, type ReleaseSource } from "./android-release.ts";
import { createApp } from "./app.ts";

const ASSET_URL = "https://api.github.com/repos/someone/app/releases/assets/42";
const SIGNED_URL = "https://objects.example/app-release.apk?sig=abc";

function fakeGithub(release: object | null) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer secret");
    if (String(url).endsWith("/releases/latest")) {
      return release
        ? Response.json(release)
        : Response.json({ message: "Not Found" }, { status: 404 });
    }
    expect(String(url)).toBe(ASSET_URL);
    expect(headers.get("accept")).toBe("application/octet-stream");
    expect(init?.redirect).toBe("manual");
    return new Response(null, {
      status: 302,
      headers: { location: SIGNED_URL },
    });
  });
}

const RELEASE = {
  tag_name: "v1.4.0",
  assets: [
    { name: "notes.txt", url: "https://api.github.com/other" },
    { name: "workout-logger-1.4.0.apk", url: ASSET_URL },
  ],
};

function source(fetch: typeof globalThis.fetch, now = () => 0) {
  return githubReleases({
    repository: "someone/app",
    token: "secret",
    fetch,
    now,
  });
}

describe("githubReleases", () => {
  it("finds the APK of the latest release", async () => {
    const releases = source(fakeGithub(RELEASE));
    expect(await releases.latest()).toEqual({
      version: "1.4.0",
      assetUrl: ASSET_URL,
    });
  });

  it("has no release when the repository has none", async () => {
    expect(await source(fakeGithub(null)).latest()).toBeNull();
  });

  it("has no release when the latest one has no APK", async () => {
    const fetch = fakeGithub({ tag_name: "v1.4.0", assets: [] });
    expect(await source(fetch).latest()).toBeNull();
  });

  it("asks GitHub again only after the cache expires", async () => {
    const fetch = fakeGithub(RELEASE);
    let now = 0;
    const releases = source(fetch, () => now);
    await releases.latest();
    now = 4 * 60 * 1000;
    await releases.latest();
    expect(fetch).toHaveBeenCalledTimes(1);
    now = 6 * 60 * 1000;
    await releases.latest();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("fails when GitHub does", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 500 }));
    await expect(source(fetch).latest()).rejects.toThrow("500");
  });
});

describe("/api/android", () => {
  const app = (releases?: ReleaseSource) =>
    createApp({ webRoot: "unused", releases });
  const configured = () => app(source(fakeGithub(RELEASE)));

  it("reports the latest version to the app's origin", async () => {
    const res = await configured().request("/api/android/latest", {
      headers: { origin: "https://localhost" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: "1.4.0" });
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://localhost",
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("gives the app GitHub's signed URL", async () => {
    const res = await configured().request("/api/android/download", {
      headers: { origin: "https://localhost" },
    });
    expect(await res.json()).toEqual({ version: "1.4.0", url: SIGNED_URL });
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://localhost",
    );
  });

  it("redirects the download to GitHub's signed URL", async () => {
    const res = await configured().request("/api/android/apk");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(SIGNED_URL);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it.each(["/api/android/latest", "/api/android/apk"])(
    "answers 404 without a release: %s",
    async (path) => {
      const res = await app(source(fakeGithub(null))).request(path);
      expect(res.status).toBe(404);
    },
  );

  it("answers 503 when no token is configured", async () => {
    const res = await app().request("/api/android/latest");
    expect(res.status).toBe(503);
  });

  it("answers 502 when GitHub fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = vi.fn(async () => new Response(null, { status: 500 }));
    const res = await app(source(failing)).request("/api/android/latest");
    expect(res.status).toBe(502);
    error.mockRestore();
  });
});
