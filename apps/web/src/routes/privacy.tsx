import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "../features/privacy/privacy-page.tsx";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});
