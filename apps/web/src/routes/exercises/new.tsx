import { createFileRoute } from "@tanstack/react-router";
import { NewExercisePage } from "../../features/exercises/exercise-editor.tsx";

export const Route = createFileRoute("/exercises/new")({
  component: NewExercisePage,
});
