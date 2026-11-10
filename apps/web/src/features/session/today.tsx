import { Link } from "@tanstack/react-router";
import { effectiveSessionEnd, type SessionSummary } from "@workout-logger/core";
import { ChevronRight, Play } from "lucide-react";
import { buttonClass } from "../../components/button.tsx";
import { listClass, rowClass } from "../../components/list.ts";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { useDbQuery } from "../../db/react.tsx";
import {
  formatDuration,
  formatSessionDate,
  formatTime,
} from "../../lib/format.ts";
import { useNow } from "../../lib/use-now.ts";
import { RECENT_LIMIT } from "./running.ts";

export function TodayPage() {
  const sessions = useDbQuery("recentSessions", { limit: RECENT_LIMIT });
  const settings = useDbQuery("settings");
  const now = useNow();
  const idleMs = settings.idle_threshold_s * 1000;
  const endOf = (s: SessionSummary) =>
    effectiveSessionEnd(
      { started_at: s.startedAt, ended_at: s.endedAt, end_reason: s.endReason },
      s.lastSetAt,
      now,
      idleMs,
    );
  const running = sessions.find((s) => endOf(s).running);
  const past = sessions.filter((s) => s !== running);

  return (
    <Screen header={<PageHeader title="Today" />} scrollId="today">
      <div className="pt-2 lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-10">
        <section>
          <div className="px-4 lg:px-0">
            {running ? (
              <RunningCard session={running} now={now} />
            ) : (
              <Link
                to="/start"
                className={`${buttonClass("primary", "lg")} w-full`}
              >
                <Play size={20} fill="currentColor" />
                Start session
              </Link>
            )}
          </div>
        </section>

        <section className="mt-8 lg:mt-0">
          <h2 className="px-4 pb-2 text-lg font-semibold lg:px-0">
            Past sessions
          </h2>
          {past.length === 0 ? (
            <Empty>Sessions you log show up here.</Empty>
          ) : (
            <ul className={listClass}>
              {past.map((s) => {
                const end = endOf(s);
                return (
                  <li key={s.id}>
                    <Link
                      to="/sessions/$sessionId"
                      params={{ sessionId: s.id }}
                      className={`${rowClass} flex items-center gap-3 py-3`}
                    >
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
                          {formatSessionDate(s.startedAt, s.tz)}, {s.setCount}{" "}
                          {s.setCount === 1 ? "set" : "sets"}
                        </p>
                      </div>
                      {!end.running && end.reason !== "unknown" && (
                        <span className="tabular text-sm text-ink-muted">
                          {formatDuration((end.endedAt - s.startedAt) / 1000)}
                        </span>
                      )}
                      <ChevronRight size={18} className="text-ink-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Screen>
  );
}

function RunningCard(props: { session: SessionSummary; now: number }) {
  const { session, now } = props;
  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: session.id }}
      className="block rounded-2xl border border-rule bg-raised p-5 text-ink hover:bg-surface/60"
    >
      <p className="text-sm opacity-70">
        Running since {formatTime(session.startedAt, session.tz)}
      </p>
      <p className="mt-1 text-2xl font-semibold">
        {session.dayName ?? "Ad hoc session"}
      </p>
      {session.routineName && (
        <p className="opacity-70">{session.routineName}</p>
      )}
      <div className="mt-5 flex items-end justify-between">
        <p className="numerals text-5xl leading-none">
          {formatDuration((now - session.startedAt) / 1000)}
        </p>
        <p className="text-right text-sm">
          {session.setCount} {session.setCount === 1 ? "set" : "sets"}
          <br />
          <span className="font-semibold">Continue</span>
        </p>
      </div>
    </Link>
  );
}
