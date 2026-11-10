import { createFileRoute } from "@tanstack/react-router";
import { SessionIndex } from "../../../features/session/session-view.tsx";

export const Route = createFileRoute("/sessions/$sessionId/")({
  component: SessionIndex,
});
