import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";
import pkg from "../package.json" with { type: "json" };

export interface AppOptions {
  /** Directory with the built web app (`apps/web/dist`). */
  webRoot: string;
  /** Commit SHA the image was built from, if known. */
  commit?: string | undefined;
}

export interface Status {
  version: string;
  commit: string | null;
}

// Vite content-hashes everything under /assets. Everything else (index.html,
// sw.js, the workbox runtime, the manifest, icons) keeps its name across
// releases, so browsers must revalidate it or they never see an update.
const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache";

// Set after the response exists: serveStatic's onFound runs after it has built
// the response, and headers set there are dropped.
const cacheControl =
  (value: string): MiddlewareHandler =>
  async (c, next) => {
    await next();
    if (c.res.ok) c.header("Cache-Control", value);
  };

export function createApp({ webRoot, commit }: AppOptions): Hono {
  const app = new Hono();

  app.use(secureHeaders());

  app.get("/api/status", (c) =>
    c.json<Status>({ version: pkg.version, commit: commit ?? null }),
  );
  app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

  app.get(
    "/assets/*",
    cacheControl(IMMUTABLE),
    serveStatic({ root: webRoot }),
    // A missing hashed file is a stale or wrong URL. Answering with
    // index.html would hand HTML to a script or wasm loader.
    (c) => c.notFound(),
  );

  app.get(
    "*",
    cacheControl(REVALIDATE),
    serveStatic({ root: webRoot }),
    // Client-side routes.
    serveStatic({ root: webRoot, path: "index.html" }),
  );

  return app;
}
