import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ANDROID_ORIGIN } from "./android-release.ts";

/** `manifest.json`, written by the web build next to `bundle.zip`. */
export interface BundleManifest {
  /** The commit the web build was made from. */
  version: string;
  /** The oldest Android shell the build runs in. */
  minNative: string;
  /** SHA-256 of the zip, hex. */
  checksum: string;
  /** RSA-SHA256 signature of the zip, base64; null for an unsigned build. */
  signature: string | null;
}

async function readManifest(root: string): Promise<BundleManifest | null> {
  try {
    const text = await readFile(join(root, "manifest.json"), "utf8");
    return JSON.parse(text) as BundleManifest;
  } catch (error) {
    // A build without a known commit has no bundle.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * The web build as a zip for the Android app's live updates, mounted at
 * /api/android/bundle. It is the server's own build, so unlike the APK it
 * needs no GitHub token.
 */
export function bundleRoutes(bundleRoot: string): Hono {
  const routes = new Hono();
  routes.use(cors({ origin: ANDROID_ORIGIN }));
  routes.onError((error, c) => {
    console.error("Reading the live-update bundle failed", error);
    return c.json({ error: "bundle unavailable" }, 500);
  });
  routes.get("/", async (c) => {
    const manifest = await readManifest(bundleRoot);
    if (!manifest) return c.json({ error: "no bundle" }, 404);
    return c.json(manifest);
  });
  // The version is in the path so that a deploy between the app's two
  // requests answers 404 instead of a zip the app would file under the
  // old version.
  routes.get("/:file{.+\\.zip}", async (c) => {
    const manifest = await readManifest(bundleRoot);
    if (!manifest || c.req.param("file") !== `${manifest.version}.zip`) {
      return c.json({ error: "no such bundle" }, 404);
    }
    const zip = await readFile(join(bundleRoot, "bundle.zip"));
    return c.body(zip, 200, { "Content-Type": "application/zip" });
  });
  return routes;
}
