import {
  type DateRange,
  daysBetweenSessions,
  type IsoDate,
  localDate,
  sessionsPerWeek,
  type TrainingStats,
  type WeekStart,
} from "@workout-logger/core";
import { useTranslation } from "react-i18next";
import { BarChart } from "../../components/chart/index.tsx";
import { FieldLabel, SectionHeading } from "../../components/headings.tsx";
import { Segmented } from "../../components/segmented.tsx";
import { dateFormat, dateFromIso, numberFormat } from "../../lib/format.ts";
import { dayDotClass } from "./day-colors.ts";
import { ONE_DECIMAL, SHORT_DATE } from "./format-options.ts";
import { MuscleSets } from "./muscle-sets.tsx";
import {
  type Period,
  periodOptions,
  periodStart,
  usePeriod,
} from "./period.ts";

/** The period, cut to start at the first session so averages aren't diluted. */
function rangeOf(period: Period, today: IsoDate, first: IsoDate): DateRange {
  const from = periodStart(period, today) ?? first;
  return { from: from < first ? first : from, to: today };
}

export function FrequencySection(props: {
  stats: TrainingStats;
  weekStart: WeekStart;
  today: IsoDate;
}) {
  const { stats, weekStart, today } = props;
  const { t } = useTranslation();
  const one = numberFormat(ONE_DECIMAL);
  const [period, setPeriod] = usePeriod();
  const days = stats.sessions.map((s) => ({
    ...s,
    date: localDate(s.startedAt, s.tz),
  }));
  if (days.length === 0) return null;
  const range = rangeOf(period, today, days[0]?.date ?? today);
  const dates = days.map((d) => d.date);
  const perWeek = sessionsPerWeek(dates, range, weekStart);
  const gaps = daysBetweenSessions(dates, range);
  const inRange = days.filter(
    (d) => d.date >= range.from && d.date <= range.to,
  );

  return (
    <section aria-labelledby="frequency" className="px-4 lg:px-0">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <SectionHeading id="frequency" inset={false} className="pb-0">
          {t("history.frequency.title")}
        </SectionHeading>
        <Segmented
          label={t("history.periods.label")}
          size="sm"
          value={period}
          onChange={setPeriod}
          options={periodOptions()}
        />
      </div>

      <dl className="grid grid-cols-2 gap-2">
        <Stat
          label={t("history.frequency.sessionsPerWeek")}
          value={one.format(perWeek.average)}
        />
        <Stat
          label={t("history.frequency.daysBetweenSessions")}
          value={gaps.average === null ? "–" : one.format(gaps.average)}
        />
      </dl>

      <FieldLabel as="h3" className="block pt-6 pb-2">
        {t("history.frequency.sessionsPerWeek")}
      </FieldLabel>
      <BarChart
        label={t("history.frequency.sessionsPerWeek")}
        xKind="time"
        height={180}
        bars={perWeek.weeks.map((w) => ({
          x: dateFromIso(w.week),
          v: w.count,
        }))}
        formatX={(x) =>
          t("history.frequency.weekOf", {
            date: dateFormat(SHORT_DATE).format(x),
          })
        }
        formatValue={(v) => t("history.frequency.sessionCount", { count: v })}
        formatTick={String}
        reference={{
          value: perWeek.average,
          label: t("history.frequency.average", {
            value: one.format(perWeek.average),
          }),
        }}
      />

      {gaps.distribution.length > 0 && (
        <>
          <FieldLabel as="h3" className="block pt-6 pb-2">
            {t("history.frequency.daysBetweenSessions")}
          </FieldLabel>
          <BarChart
            label={t("history.frequency.daysBetweenSessions")}
            xKind="category"
            height={160}
            color="day-2"
            bars={gaps.distribution.map((b) => ({ x: b.days, v: b.count }))}
            formatX={(x) =>
              gaps.distribution.find((b) => b.days === x)?.orMore
                ? `${x}+`
                : String(x)
            }
            formatValue={(v) => t("history.frequency.timeCount", { count: v })}
            formatTick={String}
          />
        </>
      )}

      <MuscleSets
        sessions={days}
        muscles={stats.muscles}
        range={range}
        weekStart={weekStart}
      />

      <RoutineDays stats={stats} days={days} inRange={inRange} />
    </section>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-raised p-3 ring-1 ring-rule">
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
  const { t } = useTranslation();
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
          <FieldLabel as="h3" className="block pt-6 pb-1">
            {r.name}
          </FieldLabel>
          {r.days.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {t("history.frequency.noDays")}
            </p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="text-sm text-ink-muted">
                  <th scope="col" className="py-1 font-normal">
                    {t("history.frequency.day")}
                  </th>
                  <th scope="col" className="py-1 text-right font-normal">
                    {t("history.frequency.times")}
                  </th>
                  <th scope="col" className="py-1 pl-4 text-right font-normal">
                    {t("history.frequency.lastDone")}
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
                        {last
                          ? dateFormat(SHORT_DATE).format(dateFromIso(last))
                          : "–"}
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
