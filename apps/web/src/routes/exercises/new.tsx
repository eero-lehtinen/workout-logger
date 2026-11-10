import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";
import { NewExercisePage } from "../../features/exercises/exercise-editor.tsx";

/** `from`: an exercise to copy into the new one. */
const search = v.object({ from: v.optional(v.string()) });

export const Route = createFileRoute("/exercises/new")({
  validateSearch: search,
  component: NewExercisePage,
});
