import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";
import { SessionLayout } from "../../../features/session/session-view.tsx";

/**
 * Where the session was opened from, so the back button returns there: the
 * calendar, or an exercise's history (`exerciseId`). Today without either.
 */
const search = v.object({
  from: v.optional(v.literal("calendar")),
  exerciseId: v.optional(v.string()),
});

export const Route = createFileRoute("/sessions/$sessionId")({
  validateSearch: search,
  component: SessionLayout,
});
