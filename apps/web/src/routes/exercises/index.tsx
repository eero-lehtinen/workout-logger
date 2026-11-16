import { createFileRoute } from "@tanstack/react-router";
import { ExercisesPage } from "../../features/exercises/exercises-page.tsx";

export const Route = createFileRoute("/exercises/")({
  loader: ({ context }) =>
    context.preload(["exercises"], ["muscles"], ["settings"]),
  component: ExercisesPage,
});
