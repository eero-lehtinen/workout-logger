import { createFileRoute } from "@tanstack/react-router";
import { StartPage } from "../features/session/start.tsx";

export const Route = createFileRoute("/start")({
  component: StartPage,
});
