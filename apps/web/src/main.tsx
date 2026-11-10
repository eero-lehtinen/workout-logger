import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DbGate } from "./components/db-gate.tsx";
import { SyncRunner } from "./components/sync-runner.tsx";
import { DatabaseProvider } from "./db/react.tsx";
import { initAccount } from "./lib/account.ts";
import { runningInstalled, watchInstall } from "./lib/install.ts";
import { startLiveUpdates } from "./lib/live-update.ts";
import { isNative } from "./lib/platform.ts";
import { requestPersistenceOnce } from "./lib/storage.ts";
import { initTheme } from "./lib/theme.ts";
import { createAppRouter } from "./router.ts";
import "./styles.css";

const router = createAppRouter();

const rootElement = document.getElementById("app");
if (!rootElement) {
  throw new Error("Missing #app element");
}

// Neither applies to the Android app: it isn't installed from the browser,
// and its WebView never grants persistence.
if (!isNative) {
  watchInstall();
  void requestPersistenceOnce(runningInstalled() ? "installed" : "browser");
}

initTheme();
initAccount();
startLiveUpdates();

createRoot(rootElement).render(
  <StrictMode>
    <DatabaseProvider fallback={DbGate}>
      <SyncRunner />
      <RouterProvider router={router} />
    </DatabaseProvider>
  </StrictMode>,
);
