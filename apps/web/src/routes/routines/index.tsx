import { createFileRoute } from "@tanstack/react-router";
import { RoutinesPage } from "../../features/routines/routines-page.tsx";

export const Route = createFileRoute("/routines/")({
  component: RoutinesPage,
});
