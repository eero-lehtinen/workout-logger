import { createFileRoute } from "@tanstack/react-router";
import { RECENT_LIMIT } from "../features/session/running.ts";
import { StartPage } from "../features/session/start.tsx";

export const Route = createFileRoute("/start")({
  loader: ({ context }) =>
    context.preload(
      ["startOptions"],
      ["recentSessions", { limit: RECENT_LIMIT }],
      ["settings"],
    ),
  component: StartPage,
});
