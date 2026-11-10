import { createFileRoute } from "@tanstack/react-router";
import { ExerciseLogPage } from "../../../features/session/exercise-log.tsx";

export const Route = createFileRoute("/sessions/$sessionId/$sessionExerciseId")(
  {
    component: ExerciseLogPage,
  },
);
