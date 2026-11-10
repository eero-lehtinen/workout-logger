import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DbGate } from "./components/db-gate.tsx";
import { DatabaseProvider } from "./db/react.tsx";
import { requestPersistenceOnce } from "./lib/storage.ts";
import { routeTree } from "./routeTree.gen.ts";
import "./styles.css";

const router = createRouter({ routeTree, defaultPreload: false });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");
if (!rootElement) {
  throw new Error("Missing #app element");
}

void requestPersistenceOnce();

createRoot(rootElement).render(
  <StrictMode>
    <DatabaseProvider fallback={DbGate}>
      <RouterProvider router={router} />
    </DatabaseProvider>
  </StrictMode>,
);
