import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";
import { EditExercisePage } from "../../features/exercises/exercise-editor.tsx";
import { originSearch } from "../../features/exercises/origin.ts";

/**
 * Opened from the history screen (`from`), the editor returns there and
 * keeps the history's origin; otherwise it returns to the origin itself.
 */
const search = v.object({
  ...originSearch.entries,
  from: v.optional(v.literal("history")),
});

export const Route = createFileRoute("/exercises/$exerciseId")({
  validateSearch: search,
  component: EditExercisePage,
});
