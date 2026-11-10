import { createRootRoute } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell.tsx";
import { Empty } from "../components/page.tsx";

export const Route = createRootRoute({
  component: AppShell,
  notFoundComponent: () => <Empty>This page doesn't exist.</Empty>,
});
