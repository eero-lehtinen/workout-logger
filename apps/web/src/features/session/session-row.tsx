import { Link } from "@tanstack/react-router";
import { effectiveSessionEnd, type SessionSummary } from "@workout-logger/core";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { rowClass } from "../../components/list.ts";
import {
  formatSessionDate,
  formatSessionLength,
  formatTime,
} from "../../lib/format.ts";

/** A past session in a list, linking to it. */
export function SessionRow(props: {
  session: SessionSummary;
  now: number;
  idleThresholdS: number;
  /** `date` for lists over many days, `time` for one day's sessions. */
  when: "date" | "time";
  /** Shown before the name, e.g. the routine day's color. */
  mark?: ReactNode;
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
      className={`${rowClass} flex items-center gap-3 py-3`}
    >
      {props.mark}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {s.dayName ?? "Ad hoc"}
          {s.routineName && (
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
          <span className="tabular text-sm text-ink-muted">
            {formatSessionLength(end.endedAt - s.startedAt)}
          </span>
        )
      )}
      <ChevronRight size={18} className="text-ink-muted" />
    </Link>
  );
}
