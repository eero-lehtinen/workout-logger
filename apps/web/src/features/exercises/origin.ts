import * as v from "valibot";
import { i18n } from "../../i18n/index.ts";

/**
 * Where an exercise's history or editor was opened from, in its search
 * params, so the back button returns there: the logging screen (both ids),
 * a session's page (`sessionId` only), or the exercise list (neither).
 */
export const originSearch = v.object({
  sessionId: v.optional(v.string()),
  sessionExerciseId: v.optional(v.string()),
});

export type Origin = v.InferOutput<typeof originSearch>;

/** Only the origin's own params, e.g. to pass the origin along a link. */
export function originOf(search: Origin): Origin {
  return {
    ...(search.sessionId !== undefined && { sessionId: search.sessionId }),
    ...(search.sessionExerciseId !== undefined && {
      sessionExerciseId: search.sessionExerciseId,
    }),
  };
}

/** The back link to the origin; the exercise list without one. */
export function backToOrigin(origin: Origin) {
  const { sessionId, sessionExerciseId } = origin;
  if (sessionId !== undefined && sessionExerciseId !== undefined) {
    return {
      to: "/sessions/$sessionId/$sessionExerciseId" as const,
      params: { sessionId, sessionExerciseId },
      label: i18n.t("exercises.back.toLogging"),
    };
  }
  if (sessionId !== undefined) {
    return {
      to: "/sessions/$sessionId" as const,
      params: { sessionId },
      label: i18n.t("exercises.back.toSession"),
    };
  }
  return {
    to: "/exercises" as const,
    label: i18n.t("exercises.back.toExercises"),
  };
}
