import { createFileRoute } from "@tanstack/react-router";
import { ExercisesPage } from "../../features/exercises/exercises-page.tsx";

export const Route = createFileRoute("/exercises/")({
  component: ExercisesPage,
});
