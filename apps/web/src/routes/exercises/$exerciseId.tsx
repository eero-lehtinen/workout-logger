import { createFileRoute } from "@tanstack/react-router";
import { EditExercisePage } from "../../features/exercises/exercise-editor.tsx";

export const Route = createFileRoute("/exercises/$exerciseId")({
  component: EditExercisePage,
});
