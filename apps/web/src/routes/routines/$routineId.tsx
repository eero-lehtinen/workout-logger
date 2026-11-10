import { createFileRoute } from "@tanstack/react-router";
import { RoutineEditor } from "../../features/routines/routine-editor.tsx";

export const Route = createFileRoute("/routines/$routineId")({
  component: RoutineEditor,
});
