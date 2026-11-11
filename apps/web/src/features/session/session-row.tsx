import { Link } from "@tanstack/react-router";
import { effectiveSessionEnd, type ListedSession } from "@workout-logger/core";
import { rowClass } from "../../components/list.ts";
import {
  formatSessionDate,
  formatSessionLength,
  formatTime,
} from "../../lib/format.ts";
import { dayDotClass } from "../history/day-colors.ts";

/**
 * Whether a list's sessions come from more than one routine. Only then do
 * their rows name the routine; otherwise it repeats on every row.
 */
export function spansRoutines(sessions: readonly ListedSession[]): boolean {
  return new Set(sessions.flatMap((s) => s.routineId ?? [])).size > 1;
}

/** A past session in a list, linking to it. */
export function SessionRow(props: {
  session: ListedSession;
  now: number;
  idleThresholdS: number;
  /** `date` for lists over many days, `time` for one day's sessions. */
  when: "date" | "time";
  showRoutine: boolean;
  /** The session page's back button returns to the calendar. */
  fromCalendar?: boolean;
}) {
  const { session: s } = props;
  const end = effectiveSessionEnd(
    { started_at: s.startedAt, ended_at: s.endedAt, end_reason: s.endReason },
    s.lastSetAt,
    props.now,
    props.idleThresholdS * 1000,
  );
  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: s.id }}
      search={props.fromCalendar ? { from: "calendar" } : {}}
      className={`${rowClass} flex items-center gap-3 py-3`}
    >
      <span
        aria-hidden
        className={`size-3 shrink-0 rounded-full ${dayDotClass(s.dayIndex)}`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {s.dayName ?? "Ad hoc"}
          {props.showRoutine && s.routineName && (
            <span className="font-normal text-ink-muted">
              {" "}
              in {s.routineName}
            </span>
          )}
        </p>
        <p className="text-sm text-ink-muted">
          {props.when === "date"
            ? formatSessionDate(s.startedAt, s.tz)
            : formatTime(s.startedAt, s.tz)}
          , {s.setCount} {s.setCount === 1 ? "set" : "sets"}
        </p>
      </div>
      {end.running ? (
        <span className="text-sm font-medium text-increase">Running</span>
      ) : (
        end.reason !== "unknown" && (
          <span className="numerals text-lg">
            {formatSessionLength(end.endedAt - s.startedAt)}
          </span>
        )
      )}
    </Link>
  );
}
