import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";
import { RoutineEditor } from "../../features/routines/routine-editor.tsx";

/**
 * Set when the editor was opened from a session: it returns to that session
 * and highlights the session's day.
 */
const search = v.object({
  sessionId: v.optional(v.string()),
  dayId: v.optional(v.string()),
});

export const Route = createFileRoute("/routines/$routineId")({
  validateSearch: search,
  component: RoutineEditor,
});
