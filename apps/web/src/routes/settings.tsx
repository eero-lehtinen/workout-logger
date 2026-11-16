import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../features/settings/settings-page.tsx";

export const Route = createFileRoute("/settings")({
  loader: ({ context }) => context.preload(["settings"], ["syncStatus"]),
  component: SettingsPage,
});
