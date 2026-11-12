import { Link } from "@tanstack/react-router";
import { effectiveSessionEnd, type SessionSummary } from "@workout-logger/core";
import { Play } from "lucide-react";
import { buttonClass } from "../../components/button.tsx";
import { SectionHeading } from "../../components/headings.tsx";
import { listClass } from "../../components/list.ts";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { useDbQuery } from "../../db/react.tsx";
import { formatDuration, formatTime } from "../../lib/format.ts";
import { useMediaQuery, WIDE } from "../../lib/use-media-query.ts";
import { useNow } from "../../lib/use-now.ts";
import { RECENT_LIMIT } from "./running.ts";
import { SessionRow, spansRoutines } from "./session-row.tsx";

export function TodayPage() {
  const sessions = useDbQuery("recentSessions", { limit: RECENT_LIMIT });
  const settings = useDbQuery("settings");
  const now = useNow();
  const wide = useMediaQuery(WIDE);
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
  const action = running ? (
    <RunningCard
      session={running}
      now={now}
      showElapsed={settings.session_timer_shown}
    />
  ) : (
    <StartLink />
  );

  // On phones the action goes in the footer, in thumb reach.
  return (
    <Screen
      header={<PageHeader title="Today" />}
      footer={!wide && <div className="px-4 py-3">{action}</div>}
      scrollId="today"
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-10">
        {wide && <section>{action}</section>}

        <section>
          {past.length === 0 ? (
            <Empty>Sessions you log show up here.</Empty>
          ) : (
            <>
              <SectionHeading>Past sessions</SectionHeading>
              <ul className={listClass}>
                {past.map((s) => (
                  <li key={s.id}>
                    <SessionRow
                      session={s}
                      now={now}
                      idleThresholdS={settings.idle_threshold_s}
                      when="date"
                      showRoutine={spansRoutines(past)}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </Screen>
  );
}

function StartLink() {
  return (
    <Link to="/start" className={`${buttonClass("primary", "xl")} w-full`}>
      <Play size={22} fill="currentColor" />
      Start session
    </Link>
  );
}

function RunningCard(props: {
  session: SessionSummary;
  now: number;
  showElapsed: boolean;
}) {
  const { session, now } = props;
  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: session.id }}
      className="block rounded-2xl border border-rule bg-raised p-5 text-ink hover:bg-surface/60 active:bg-surface"
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
        {props.showElapsed && (
          <p className="numerals text-5xl leading-none">
            {formatDuration((now - session.startedAt) / 1000)}
          </p>
        )}
        <p className="ml-auto text-right">
          <span className="block text-sm opacity-70">
            {session.setCount} {session.setCount === 1 ? "set" : "sets"}
          </span>
          <span className="block text-lg font-semibold">Continue</span>
        </p>
      </div>
    </Link>
  );
}
