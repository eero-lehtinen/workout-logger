import { createFileRoute } from "@tanstack/react-router";
import { ExerciseLogPage } from "../../../features/session/exercise-log.tsx";

export const Route = createFileRoute("/sessions/$sessionId/$sessionExerciseId")(
  {
    loader: ({ context, params }) =>
      context.preload(
        ["exerciseLog", { sessionExerciseId: params.sessionExerciseId }],
        ["settings"],
      ),
    component: ExerciseLogPage,
  },
);
