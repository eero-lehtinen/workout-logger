import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
  type IsoDate,
  type ListedSession,
  localDate,
  type WeekStart,
} from "@workout-logger/core";
import { useDeferredValue } from "react";
import { Trans, useTranslation } from "react-i18next";
import { SectionHeading } from "../../components/headings.tsx";
import { listClass } from "../../components/list.ts";
import { Empty, PageHeader, Screen } from "../../components/page.tsx";
import { useDbQuery } from "../../db/react.tsx";
import { dateFormat, deviceTimeZone, todayIso } from "../../lib/format.ts";
import { useNow } from "../../lib/use-now.ts";
import { SessionRow, spansRoutines } from "../session/session-row.tsx";
import { FrequencySection } from "./frequency-section.tsx";
import { MonthCalendar, monthGrid } from "./month-calendar.tsx";

const route = getRouteApi("/history");

export function HistoryPage() {
  const { t } = useTranslation();
  const search = route.useSearch();
  const navigate = useNavigate({ from: "/history" });
  const settings = useDbQuery("settings");
  const stats = useDbQuery("trainingStats");
  const weekStart = settings.week_start as WeekStart;
  const today = todayIso();
  const month = search.month ?? today.slice(0, 7);
  const selected = search.day ?? (month === today.slice(0, 7) ? today : null);
  const monthCounts = new Map<string, number>();
  for (const s of stats.sessions) {
    const m = localDate(s.startedAt, s.tz).slice(0, 7);
    monthCounts.set(m, (monthCounts.get(m) ?? 0) + 1);
  }
  const firstYear = Math.min(
    ...[...monthCounts.keys(), today].map((d) => Number(d.slice(0, 4))),
  );

  return (
    <Screen
      header={<PageHeader title={t("history.title")} />}
      scrollId="history"
    >
      {stats.sessions.length === 0 ? (
        <Empty>
          <Trans
            i18nKey="history.empty"
            components={{
              start: (
                <Link
                  to="/start"
                  className="font-semibold text-ink underline underline-offset-2"
                />
              ),
            }}
          />
        </Empty>
      ) : (
        <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-12">
          <div>
            <MonthSessions
              month={month}
              weekStart={weekStart}
              today={today}
              selected={selected}
              monthCounts={monthCounts}
              firstYear={firstYear}
              onSelect={(day) =>
                navigate({
                  search: { month: day.slice(0, 7), day },
                  replace: true,
                })
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
  monthCounts: ReadonlyMap<string, number>;
  firstYear: number;
  onSelect: (day: IsoDate) => void;
  onMonth: (month: string) => void;
}) {
  const { t } = useTranslation();
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
        monthCounts={props.monthCounts}
        firstYear={props.firstYear}
        today={props.today}
        selected={props.selected}
        onSelect={props.onSelect}
        onMonth={props.onMonth}
      />
      {props.selected && (
        <section aria-labelledby="day-sessions" className="pt-6">
          <SectionHeading id="day-sessions">
            {dateFormat({
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            }).format(
              Temporal.PlainDate.from(props.selected).toZonedDateTime("UTC")
                .epochMilliseconds,
            )}
          </SectionHeading>
          {daySessions.length === 0 ? (
            <p className="px-4 text-[0.9375rem] text-ink-muted lg:px-0">
              {t("history.noSessions")}
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
