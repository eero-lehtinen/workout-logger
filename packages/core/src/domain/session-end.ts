import type { SessionEndReason, SessionTable } from "../schema/tables.ts";

export const DEFAULT_IDLE_THRESHOLD_MS = 30 * 60 * 1000;

export type EffectiveEnd =
  | { running: true }
  | { running: false; endedAt: number; reason: SessionEndReason | "idle" };

/**
 * When a session ended. A manual stop is stored; idle auto-end is derived
 * here, never written, so no device overwrites another's edits with a
 * computed value (docs/architecture.md#data-model-client).
 *
 * Idle is measured from the last logged set, or from the start if no set was
 * logged, and ends the session at that moment.
 */
export function effectiveSessionEnd(
  session: Pick<SessionTable, "started_at" | "ended_at" | "end_reason">,
  lastSetAt: number | null,
  now: number,
  idleThresholdMs: number = DEFAULT_IDLE_THRESHOLD_MS,
): EffectiveEnd {
  if (session.ended_at !== null) {
    return {
      running: false,
      endedAt: session.ended_at,
      reason: session.end_reason ?? "manual",
    };
  }
  const lastActivity = Math.max(
    session.started_at,
    lastSetAt ?? session.started_at,
  );
  if (now - lastActivity > idleThresholdMs) {
    return { running: false, endedAt: lastActivity, reason: "idle" };
  }
  return { running: true };
}
