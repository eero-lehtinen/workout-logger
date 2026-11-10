import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DbGate } from "./components/db-gate.tsx";
import { DatabaseProvider } from "./db/react.tsx";
import { runningInstalled, watchInstall } from "./lib/install.ts";
import { requestPersistenceOnce } from "./lib/storage.ts";
import { createAppRouter } from "./router.ts";
import "./styles.css";

const router = createAppRouter();

const rootElement = document.getElementById("app");
if (!rootElement) {
  throw new Error("Missing #app element");
}

watchInstall();
void requestPersistenceOnce(runningInstalled() ? "installed" : "browser");

createRoot(rootElement).render(
  <StrictMode>
    <DatabaseProvider fallback={DbGate}>
      <RouterProvider router={router} />
    </DatabaseProvider>
  </StrictMode>,
);
