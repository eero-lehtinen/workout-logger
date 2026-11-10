import { createFileRoute } from "@tanstack/react-router";
import { SessionLayout } from "../../../features/session/session-view.tsx";

export const Route = createFileRoute("/sessions/$sessionId")({
  component: SessionLayout,
});
