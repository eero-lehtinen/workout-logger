import { serveStatic } from "@hono/node-server/serve-static";
import { EXPECTED_USER_HEADER } from "@workout-logger/core";
import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import pkg from "../package.json" with { type: "json" };
import { bundleRoutes } from "./android-bundle.ts";
import {
  ANDROID_ORIGIN,
  androidRoutes,
  type ReleaseSource,
} from "./android-release.ts";
import { type Auth, sessionUser, signInProviders } from "./auth/auth.ts";
import {
  type AuthEnv,
  CLIENT_VERSION_HEADER,
  requireClientVersion,
  requireUser,
} from "./auth/middleware.ts";
import { nativeAuthRoutes } from "./auth/native-auth.ts";
import { type ServerKysely, syncDb } from "./db/database.ts";
import { ownerStatus, publicStatus, type StatusSource } from "./status.ts";
import { syncRoutes } from "./sync-routes.ts";

export interface AppOptions {
  /** Directory with the built web app (`apps/web/dist`). */
  webRoot: string;
  /** Directory with the web build's live-update bundle (`apps/web/live-bundle`). */
  bundleRoot: string;
  /** Commit SHA the image was built from, if known. */
  commit?: string | undefined;
  /** Android releases, if the server is configured to read them. */
  releases?: ReleaseSource | undefined;
  db: ServerKysely;
  auth: Auth;
  databasePath: string;
  backupsConfigured: boolean;
  litestreamSocket?: string | undefined;
  minClientVersion?: string | undefined;
  now?: () => number;
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

export function createApp(options: AppOptions): Hono<AuthEnv> {
  const { webRoot, auth } = options;
  const now = options.now ?? Date.now;
  const app = new Hono<AuthEnv>();

  app.use(secureHeaders());

  // The Cloudflare cache rule makes every response cacheable at the edge,
  // and a response without Cache-Control is then kept for hours.
  app.use("/api/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });

  // The Android app calls with a bearer token, never with cookies. Its custom
  // headers need a preflight; without a max age Chromium keeps the answer
  // for only 5 s, so every minute's sync would cost an extra round trip.
  // Chromium caps it at 2 h.
  const androidCors = cors({
    origin: ANDROID_ORIGIN,
    maxAge: 7200,
    allowMethods: ["GET", "POST"],
    allowHeaders: [
      "Authorization",
      "Content-Type",
      CLIENT_VERSION_HEADER,
      EXPECTED_USER_HEADER,
    ],
  });
  for (const path of [
    "/api/status",
    "/api/sync/*",
    "/api/me",
    "/api/native-auth/*",
  ]) {
    app.use(path, androidCors);
  }

  const status: StatusSource = {
    db: options.db,
    version: pkg.version,
    commit: options.commit ?? null,
    databasePath: options.databasePath,
    backupsConfigured: options.backupsConfigured,
    litestreamSocket: options.litestreamSocket,
    signIn: signInProviders(auth),
    now,
  };
  app.get("/api/status", async (c) => {
    const user = await sessionUser(auth, c.req.raw.headers);
    return c.json(
      user?.role === "owner"
        ? await ownerStatus(status)
        : await publicStatus(status),
    );
  });

  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  app.route("/api/native-auth", nativeAuthRoutes(auth, now));

  for (const path of ["/api/me", "/api/sync/*"]) {
    app.use(path, requireClientVersion(options.minClientVersion));
    app.use(path, requireUser(auth));
  }
  app.get("/api/me", (c) => c.json(c.get("user")));
  app.route("/api/sync/v1", syncRoutes(syncDb(options.db), now));

  // Before the APK routes, which answer everything under /api/android with
  // 503 when no release token is configured.
  app.route("/api/android/bundle", bundleRoutes(options.bundleRoot));
  app.route("/api/android", androidRoutes(options.releases));
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
