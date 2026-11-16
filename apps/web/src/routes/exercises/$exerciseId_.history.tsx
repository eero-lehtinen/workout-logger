import { createFileRoute } from "@tanstack/react-router";
import { originSearch } from "../../features/exercises/origin.ts";
import { ExerciseHistoryPage } from "../../features/history/exercise-history.tsx";

export const Route = createFileRoute("/exercises/$exerciseId_/history")({
  validateSearch: originSearch,
  loader: ({ context, params }) =>
    context.preload(
      ["exerciseHistory", { exerciseId: params.exerciseId }],
      ["settings"],
    ),
  component: ExerciseHistoryPage,
});
