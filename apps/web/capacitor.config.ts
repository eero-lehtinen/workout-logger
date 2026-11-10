import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // The app id, scheme, and hostname never change: each of them is part of
  // where the WebView keeps the database, so a change orphans it
  // (docs/architecture.md#storage-durability).
  appId: "fi.eerolehtinen.lift",
  appName: "Workouts",
  webDir: "dist",
  android: { path: "../android" },
  server: {
    androidScheme: "https",
    hostname: "localhost",
  },
};

export default config;
