import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "../features/admin/admin-page.tsx";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});
