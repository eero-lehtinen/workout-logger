import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";
import { RoutineEditor } from "../../features/routines/routine-editor.tsx";

/**
 * `sessionId` and `dayId`: set when the editor was opened from a session: it
 * returns to that session and highlights the session's day. `new`: a routine
 * just created with a placeholder name, which gets focus to be renamed.
 */
const search = v.object({
  sessionId: v.optional(v.string()),
  dayId: v.optional(v.string()),
  new: v.optional(v.boolean()),
});

export const Route = createFileRoute("/routines/$routineId")({
  validateSearch: search,
  component: RoutineEditor,
});
