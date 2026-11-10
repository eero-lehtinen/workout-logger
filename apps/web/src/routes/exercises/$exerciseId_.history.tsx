import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";
import { ExerciseHistoryPage } from "../../features/history/exercise-history.tsx";

/**
 * Set when opened from the logging screen, so it returns there. Both ids or
 * neither.
 */
const search = v.union([
  v.object({ sessionId: v.string(), sessionExerciseId: v.string() }),
  v.object({}),
]);

export const Route = createFileRoute("/exercises/$exerciseId_/history")({
  validateSearch: search,
  component: ExerciseHistoryPage,
});
