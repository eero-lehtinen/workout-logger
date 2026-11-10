import { createFileRoute } from "@tanstack/react-router";
import { TodayPage } from "../features/session/today.tsx";

export const Route = createFileRoute("/")({
  component: TodayPage,
});
