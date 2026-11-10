import { effectiveSessionEnd, type SessionSummary } from "@workout-logger/core";
import { useDbQuery } from "../../db/react.tsx";
import { useNow } from "../../lib/use-now.ts";

/** How many recent sessions the home screen lists; shared cache key with it. */
export const RECENT_LIMIT = 30;

export function isRunning(
  session: SessionSummary,
  now: number,
  idleThresholdS: number,
): boolean {
  return effectiveSessionEnd(
    {
      started_at: session.startedAt,
      ended_at: session.endedAt,
      end_reason: session.endReason,
    },
    session.lastSetAt,
    now,
    idleThresholdS * 1000,
  ).running;
}

/** The latest session that hasn't ended or idled out. */
export function useRunningSession(): SessionSummary | null {
  const sessions = useDbQuery("recentSessions", { limit: RECENT_LIMIT });
  const settings = useDbQuery("settings");
  const now = useNow(15_000);
  return (
    sessions.find((s) => isRunning(s, now, settings.idle_threshold_s)) ?? null
  );
}
