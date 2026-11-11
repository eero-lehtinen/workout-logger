import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  type IsoDate,
  type ListedSession,
  localDate,
  type WeekStart,
} from "@workout-logger/core";
import { useDeferredValue } from "react";
import { listClass } from "../../components/list.ts";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { useDbQuery } from "../../db/react.tsx";
import { deviceTimeZone, todayIso } from "../../lib/format.ts";
import { useNow } from "../../lib/use-now.ts";
import { SessionRow, spansRoutines } from "../session/session-row.tsx";
import { FrequencySection } from "./frequency-section.tsx";
import { MonthCalendar, monthGrid } from "./month-calendar.tsx";

const route = getRouteApi("/history");

const dayTitle = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function HistoryPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: "/history" });
  const settings = useDbQuery("settings");
  const stats = useDbQuery("trainingStats");
  const weekStart = settings.week_start as WeekStart;
  const today = todayIso();
  const month = search.month ?? today.slice(0, 7);
  const selected = search.day ?? (month === today.slice(0, 7) ? today : null);

  return (
    <Screen header={<PageHeader title="History" />} scrollId="history">
      {stats.sessions.length === 0 ? (
        <Empty>Sessions you log show up here.</Empty>
      ) : (
        <div className="flex flex-col gap-10 pt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-12">
          <div>
            <MonthSessions
              month={month}
              weekStart={weekStart}
              today={today}
              selected={selected}
              onSelect={(day) =>
                navigate({ search: { month, day }, replace: true })
              }
              onMonth={(m) => navigate({ search: { month: m }, replace: true })}
            />
          </div>
          <FrequencySection stats={stats} weekStart={weekStart} today={today} />
        </div>
      )}
    </Screen>
  );
}

function MonthSessions(props: {
  month: string;
  weekStart: WeekStart;
  today: IsoDate;
  selected: IsoDate | null;
  onSelect: (day: IsoDate) => void;
  onMonth: (month: string) => void;
}) {
  const settings = useDbQuery("settings");
  const now = useNow();
  // Keeps showing the old month while the new one loads, instead of
  // suspending the whole screen.
  const month = useDeferredValue(props.month);
  const grid = monthGrid(month, props.weekStart);
  // A day longer on both ends: a session's date is in its own zone, which
  // may differ from the device's.
  const tz = deviceTimeZone();
  const edge = (date: IsoDate, days: number) =>
    Temporal.PlainDate.from(date).add({ days }).toZonedDateTime(tz)
      .epochMilliseconds;
  const sessions = useDbQuery("sessionsInRange", {
    from: edge(grid[0] ?? props.today, -1),
    to: edge(grid.at(-1) ?? props.today, 2),
  });
  const byDate = new Map<IsoDate, ListedSession[]>();
  for (const s of sessions) {
    const date = localDate(s.startedAt, s.tz);
    byDate.set(date, [...(byDate.get(date) ?? []), s]);
  }
  const daySessions = props.selected ? (byDate.get(props.selected) ?? []) : [];

  return (
    <>
      <MonthCalendar
        month={month}
        weekStart={props.weekStart}
        sessionsByDate={byDate}
        today={props.today}
        selected={props.selected}
        onSelect={props.onSelect}
        onMonth={props.onMonth}
      />
      {props.selected && (
        <section aria-labelledby="day-sessions" className="pt-6">
          <h2 id="day-sessions" className="px-4 pb-2 font-semibold lg:px-0">
            {dayTitle.format(
              Temporal.PlainDate.from(props.selected).toZonedDateTime("UTC")
                .epochMilliseconds,
            )}
          </h2>
          {daySessions.length === 0 ? (
            <p className="px-4 text-[0.9375rem] text-ink-muted lg:px-0">
              No sessions.
            </p>
          ) : (
            <ul className={listClass}>
              {daySessions.map((s) => (
                <li key={s.id}>
                  <SessionRow
                    session={s}
                    now={now}
                    idleThresholdS={settings.idle_threshold_s}
                    when="time"
                    showRoutine={spansRoutines(sessions)}
                    fromCalendar
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
