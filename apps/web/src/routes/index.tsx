import { createFileRoute } from "@tanstack/react-router";
import { RECENT_LIMIT } from "../features/session/running.ts";
import { TodayPage } from "../features/session/today.tsx";

export const Route = createFileRoute("/")({
  loader: ({ context }) =>
    context.preload(["recentSessions", { limit: RECENT_LIMIT }], ["settings"]),
  component: TodayPage,
});
