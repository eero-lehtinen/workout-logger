import { execSync } from "node:child_process";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * The commit this build is from, shown in Settings. The Docker build gets it
 * as GIT_COMMIT (the image has no .git), the APK build as GITHUB_SHA.
 */
function buildCommit(): string {
  const fromEnv = process.env.GIT_COMMIT || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv;
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

export default defineConfig({
  define: {
    "import.meta.env.BUILD_COMMIT": JSON.stringify(buildCommit()),
    "import.meta.env.BUILD_TIME": JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    // Must run before the React plugin.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    VitePWA({
      // A new version waits until WebUpdate switches to it, never mid-session.
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        name: "Workout Logger",
        short_name: "Workouts",
        description: "Log strength training sets and see what to beat.",
        start_url: "/",
        display: "standalone",
        background_color: "#eceeed",
        theme_color: "#1b2226",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,wasm,woff2,svg,png,ico}"],
        // sqlite-wasm's own worker and OPFS proxy scripts are emitted but
        // unused: the SAH-pool VFS runs in our worker.
        globIgnores: ["**/sqlite3-worker1*", "**/sqlite3-opfs-async-proxy*"],
        navigateFallback: "index.html",
        // The server answers these itself, e.g. the APK download. Without
        // this the service worker serves the app shell for them.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    // `pnpm start` in apps/server; with PUBLIC_URL=http://localhost:5173 the
    // GitHub sign-in returns through this proxy too.
    proxy: { "/api": "http://localhost:3000" },
  },
  optimizeDeps: {
    // Pre-bundling breaks the library's lookup of sqlite3.wasm.
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  worker: {
    format: "es",
  },
});
