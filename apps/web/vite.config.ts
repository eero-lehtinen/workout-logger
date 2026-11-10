import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    // Must run before the React plugin.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    VitePWA({
      // An update waits for the user's "reload", never mid-session.
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
  optimizeDeps: {
    // Pre-bundling breaks the library's lookup of sqlite3.wasm.
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  worker: {
    format: "es",
  },
});
