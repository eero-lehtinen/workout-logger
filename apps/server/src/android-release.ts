import { Hono } from "hono";
import { cors } from "hono/cors";

export interface AndroidRelease {
  /** The release tag without its leading "v", e.g. "1.2.3". */
  version: string;
  /** GitHub API URL of the release's APK asset. */
  assetUrl: string;
  /** The APK's download URL on github.com. */
  browserUrl: string;
}

/** Where the Android app's updates come from. */
export interface ReleaseSource {
  /** The newest release with an APK, or null if there is none. */
  latest(): Promise<AndroidRelease | null>;
  /** A URL anyone can download the APK from. */
  downloadUrl(release: AndroidRelease): Promise<string>;
}

export interface GithubReleasesOptions {
  /** `owner/name`. */
  repository: string;
  /** Read access to the repository's contents, needed only if it is private. */
  token?: string | undefined;
  fetch?: typeof fetch;
  now?: () => number;
}

const CACHE_MS = 5 * 60 * 1000;

interface GithubRelease {
  tag_name: string;
  assets: { name: string; url: string; browser_download_url: string }[];
}

/** Reads releases from the GitHub repository. */
export function githubReleases(options: GithubReleasesOptions): ReleaseSource {
  const { repository, token } = options;
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "workout-logger-server",
  };
  // The endpoints are public, so without a cache anyone could spend the
  // rate limit: the token's, or 60 an hour for the server's IP without one.
  let cached: { at: number; release: AndroidRelease | null } | undefined;

  return {
    async latest() {
      if (cached && now() - cached.at < CACHE_MS) return cached.release;
      const res = await request(
        `https://api.github.com/repos/${repository}/releases/latest`,
        { headers: { ...headers, Accept: "application/vnd.github+json" } },
      );
      let release: AndroidRelease | null = null;
      // 404: the repository has no published release yet.
      if (res.status !== 404) {
        if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
        const body = (await res.json()) as GithubRelease;
        const apk = body.assets.find((asset) => asset.name.endsWith(".apk"));
        if (apk) {
          release = {
            version: body.tag_name.replace(/^v/, ""),
            assetUrl: apk.url,
            browserUrl: apk.browser_download_url,
          };
        }
      }
      cached = { at: now(), release };
      return release;
    },

    async downloadUrl(release) {
      if (!token) return release.browserUrl;
      // A private repository's download URL needs the token, but GitHub
      // answers an asset request with a redirect to a signed URL that needs
      // none. Passing that on keeps the download off the VPS.
      const res = await request(release.assetUrl, {
        headers: { ...headers, Accept: "application/octet-stream" },
        redirect: "manual",
      });
      const location = res.headers.get("location");
      if (res.status !== 302 || !location) {
        throw new Error(`GitHub answered ${res.status} for the APK`);
      }
      return location;
    },
  };
}

/** The Android app's WebView origin (docs/architecture.md#storage-durability). */
export const ANDROID_ORIGIN = "https://localhost";

/** The Android app's update check and APK download, mounted at /api/android. */
export function androidRoutes(releases: ReleaseSource | undefined): Hono {
  const routes = new Hono();
  routes.use(cors({ origin: ANDROID_ORIGIN }));
  if (!releases) {
    routes.get("/*", (c) =>
      c.json({ error: "releases are not configured" }, 503),
    );
    return routes;
  }
  routes.onError((error, c) => {
    console.error("Android release lookup failed", error);
    return c.json({ error: "release source unavailable" }, 502);
  });
  routes.get("/latest", async (c) => {
    const release = await releases.latest();
    if (!release) return c.json({ error: "no release" }, 404);
    return c.json({ version: release.version });
  });
  // For the app: a URL on GitHub's host to hand to the phone's browser.
  // A link to this site could be answered by the service worker of the web
  // app installed in that browser instead of reaching the server.
  routes.get("/download", async (c) => {
    const release = await releases.latest();
    if (!release) return c.json({ error: "no release" }, 404);
    return c.json({
      version: release.version,
      url: await releases.downloadUrl(release),
    });
  });
  // For a first install, typed or linked in a browser.
  routes.get("/apk", async (c) => {
    const release = await releases.latest();
    if (!release) return c.json({ error: "no release" }, 404);
    return c.redirect(await releases.downloadUrl(release), 302);
  });
  return routes;
}
