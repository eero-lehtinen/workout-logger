import {
  type DateRange,
  daysBetweenSessions,
  type IsoDate,
  localDate,
  muscleGroupFrequency,
  sessionsPerWeek,
  type TrainingStats,
  type WeekStart,
} from "@workout-logger/core";
import { MUSCLE_GROUPS } from "@workout-logger/exercises";
import { useState } from "react";
import { BarChart } from "../../components/chart/index.tsx";
import { Segmented } from "../../components/segmented.tsx";
import { dateFromIso } from "../../lib/format.ts";
import { dayDotClass } from "./day-colors.ts";

type Span = "3m" | "1y" | "all";

const SPANS = [
  { value: "3m", label: "3 months" },
  { value: "1y", label: "Year" },
  { value: "all", label: "All" },
] as const;

const one = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const weekLabel = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const shortDate = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** The period, cut to start at the first session so averages aren't diluted. */
function rangeOf(span: Span, today: IsoDate, first: IsoDate): DateRange {
  const t = Temporal.PlainDate.from(today);
  const from =
    span === "3m"
      ? t.subtract({ months: 3 }).add({ days: 1 }).toString()
      : span === "1y"
        ? t.subtract({ years: 1 }).add({ days: 1 }).toString()
        : first;
  return { from: from < first ? first : from, to: today };
}

export function FrequencySection(props: {
  stats: TrainingStats;
  weekStart: WeekStart;
  today: IsoDate;
}) {
  const { stats, weekStart, today } = props;
  const [span, setSpan] = useState<Span>("1y");
  const days = stats.sessions.map((s) => ({
    ...s,
    date: localDate(s.startedAt, s.tz),
  }));
  if (days.length === 0) return null;
  const range = rangeOf(span, today, days[0]?.date ?? today);
  const dates = days.map((d) => d.date);
  const perWeek = sessionsPerWeek(dates, range, weekStart);
  const gaps = daysBetweenSessions(dates, range);
  const known: readonly string[] = MUSCLE_GROUPS;
  const groupOrder = [
    ...known.filter((g) => stats.muscleGroups.includes(g)),
    ...stats.muscleGroups.filter((g) => !known.includes(g)),
  ];
  const groups = muscleGroupFrequency(
    days.map((d) => ({ date: d.date, groups: d.muscleGroups })),
    groupOrder,
    range,
    weekStart,
  );
  const inRange = days.filter(
    (d) => d.date >= range.from && d.date <= range.to,
  );

  return (
    <section aria-labelledby="frequency" className="px-4 lg:px-0">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <h2 id="frequency" className="text-lg font-semibold">
          Frequency
        </h2>
        <Segmented
          label="Period"
          size="sm"
          value={span}
          onChange={setSpan}
          options={SPANS}
        />
      </div>

      <dl className="grid grid-cols-2 gap-2">
        <Stat label="Sessions per week" value={one.format(perWeek.average)} />
        <Stat
          label="Days between sessions"
          value={gaps.average === null ? "–" : one.format(gaps.average)}
        />
      </dl>

      <h3 className="pt-6 pb-2 font-semibold">Sessions per week</h3>
      <BarChart
        label="Sessions per week"
        xKind="time"
        height={180}
        bars={perWeek.weeks.map((w) => ({
          x: dateFromIso(w.week),
          v: w.sessions,
        }))}
        formatX={(x) => `Week of ${weekLabel.format(x)}`}
        formatValue={(v) => `${v} ${v === 1 ? "session" : "sessions"}`}
        formatTick={String}
        reference={{
          value: perWeek.average,
          label: `Average ${one.format(perWeek.average)}`,
        }}
      />

      {gaps.distribution.length > 0 && (
        <>
          <h3 className="pt-6 pb-2 font-semibold">Days between sessions</h3>
          <BarChart
            label="Days between sessions"
            xKind="category"
            height={160}
            color="ink-muted"
            bars={gaps.distribution.map((b) => ({ x: b.days, v: b.count }))}
            formatX={(x) =>
              gaps.distribution.find((b) => b.days === x)?.orMore
                ? `${x}+`
                : String(x)
            }
            formatValue={(v) => `${v} ${v === 1 ? "time" : "times"}`}
            formatTick={String}
          />
        </>
      )}

      <h3 className="pt-6 pb-1 font-semibold">Muscle groups</h3>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="text-sm text-ink-muted">
            <th scope="col" className="py-1 font-normal">
              Group
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Days per week
            </th>
            <th scope="col" className="py-1 pl-4 text-right font-normal">
              Last trained
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.group} className="border-t border-rule">
              <td className="py-1.5 font-medium">{g.group}</td>
              <td className="tabular py-1.5 text-right">
                {one.format(g.daysPerWeek)}
              </td>
              <td className="tabular py-1.5 pl-4 text-right text-ink-muted">
                {g.lastDate ? shortDate.format(dateFromIso(g.lastDate)) : "–"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <RoutineDays stats={stats} days={days} inRange={inRange} />
    </section>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-raised p-3 ring-1 ring-rule">
      <dt className="text-sm text-ink-muted">{props.label}</dt>
      <dd className="numerals text-3xl">{props.value}</dd>
    </div>
  );
}

/** How often each day of a routine was performed: is the cycle followed? */
function RoutineDays(props: {
  stats: TrainingStats;
  days: { dayId: string | null; date: IsoDate }[];
  inRange: { dayId: string | null }[];
}) {
  const routines = props.stats.routines.filter(
    (r) =>
      !r.archived ||
      props.inRange.some((s) => r.days.some((d) => d.id === s.dayId)),
  );
  if (routines.length === 0) return null;
  return (
    <>
      {routines.map((r) => (
        <div key={r.id}>
          <h3 className="pt-6 pb-1 font-semibold">{r.name}</h3>
          {r.days.length === 0 ? (
            <p className="text-sm text-ink-muted">No days.</p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="text-sm text-ink-muted">
                  <th scope="col" className="py-1 font-normal">
                    Day
                  </th>
                  <th scope="col" className="py-1 text-right font-normal">
                    Times
                  </th>
                  <th scope="col" className="py-1 pl-4 text-right font-normal">
                    Last done
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.days.map((d) => {
                  const last = props.days
                    .filter((s) => s.dayId === d.id)
                    .at(-1)?.date;
                  return (
                    <tr key={d.id} className="border-t border-rule">
                      <td className="py-1.5">
                        <span className="flex items-center gap-2 font-medium">
                          <span
                            aria-hidden
                            className={`size-2.5 rounded-full ${dayDotClass(d.index)}`}
                          />
                          {d.name}
                        </span>
                      </td>
                      <td className="tabular py-1.5 text-right">
                        {props.inRange.filter((s) => s.dayId === d.id).length}
                      </td>
                      <td className="tabular py-1.5 pl-4 text-right text-ink-muted">
                        {last ? shortDate.format(dateFromIso(last)) : "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </>
  );
}
