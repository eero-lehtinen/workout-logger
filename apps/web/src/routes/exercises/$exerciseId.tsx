import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";
import { EditExercisePage } from "../../features/exercises/exercise-editor.tsx";

/**
 * Set when the editor was opened from the logging screen, so it returns
 * there. Both ids or neither.
 */
const search = v.union([
  v.object({ sessionId: v.string(), sessionExerciseId: v.string() }),
  v.object({}),
]);

export const Route = createFileRoute("/exercises/$exerciseId")({
  validateSearch: search,
  component: EditExercisePage,
});
