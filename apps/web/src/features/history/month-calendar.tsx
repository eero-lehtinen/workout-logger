import {
  addDays,
  type CalendarSession,
  type IsoDate,
  type WeekStart,
  weekOf,
} from "@workout-logger/core";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, IconButton } from "../../components/button.tsx";
import { dateFromIso } from "../../lib/format.ts";
import { dayChipClass, dayDotClass } from "./day-colors.ts";

/** Marks shown in a day cell before "+n". */
const VISIBLE_MARKS = 2;

/** The dates of the weeks that cover `month` (`YYYY-MM`). */
export function monthGrid(month: string, weekStart: WeekStart): IsoDate[] {
  const ym = Temporal.PlainYearMonth.from(month);
  const first = ym.toPlainDate({ day: 1 }).toString();
  const last = ym.toPlainDate({ day: ym.daysInMonth }).toString();
  const end = addDays(weekOf(last, weekStart), 6);
  const days: IsoDate[] = [];
  for (let d = weekOf(first, weekStart); d <= end; d = addDays(d, 1)) {
    days.push(d);
  }
  return days;
}

export function shiftMonth(month: string, months: number): string {
  return Temporal.PlainYearMonth.from(month).add({ months }).toString();
}

const utc = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" });
const monthTitle = utc({ month: "long", year: "numeric" });
const weekday = utc({ weekday: "short" });
const dayLabel = utc({ weekday: "long", day: "numeric", month: "long" });

export function MonthCalendar(props: {
  month: string;
  weekStart: WeekStart;
  sessionsByDate: ReadonlyMap<IsoDate, CalendarSession[]>;
  today: IsoDate;
  selected: IsoDate | null;
  onSelect: (date: IsoDate) => void;
  onMonth: (month: string) => void;
}) {
  const days = monthGrid(props.month, props.weekStart);
  const thisMonth = props.today.slice(0, 7);
  return (
    <section aria-label="Calendar">
      <div className="flex items-center gap-1 px-2 pb-2 lg:px-0">
        <h2 className="flex-1 pl-2 text-lg font-semibold lg:pl-0">
          {monthTitle.format(dateFromIso(`${props.month}-01`))}
        </h2>
        {props.month !== thisMonth && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => props.onMonth(thisMonth)}
          >
            Today
          </Button>
        )}
        <IconButton
          label="Previous month"
          onClick={() => props.onMonth(shiftMonth(props.month, -1))}
        >
          <ChevronLeft size={20} />
        </IconButton>
        <IconButton
          label="Next month"
          onClick={() => props.onMonth(shiftMonth(props.month, 1))}
        >
          <ChevronRight size={20} />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 gap-px px-1 lg:px-0">
        {days.slice(0, 7).map((d) => (
          <div
            key={d}
            aria-hidden
            className="pb-1 text-center text-xs font-medium text-ink-muted"
          >
            {weekday.format(dateFromIso(d))}
          </div>
        ))}
        {days.map((d) => {
          const sessions = props.sessionsByDate.get(d) ?? [];
          const inMonth = d.startsWith(props.month);
          const hidden = sessions.length - VISIBLE_MARKS;
          return (
            <button
              key={d}
              type="button"
              onClick={() => props.onSelect(d)}
              aria-pressed={d === props.selected}
              className={clsx(
                "flex min-h-16 min-w-0 flex-col gap-0.5 rounded-lg p-1 text-left hover:bg-surface aria-pressed:bg-selected aria-pressed:ring-2 aria-pressed:ring-ink/50 lg:min-h-22 lg:p-1.5",
              )}
            >
              <span className="sr-only">
                {dayLabel.format(dateFromIso(d))}
                {sessions.length > 0 && ":"}
              </span>
              <span
                aria-hidden
                className={clsx(
                  "tabular flex size-6 items-center justify-center rounded-full text-sm",
                  d === props.today && "bg-ink font-semibold text-chalk",
                  !inMonth && "text-ink-muted",
                )}
              >
                {Number(d.slice(8))}
              </span>
              {sessions.map((s, i) => (
                <span key={s.id} className="contents">
                  {/* Phones: a name fits only a letter or two, so a colored
                      bar stands in for it, with the legend below. */}
                  <span
                    aria-hidden
                    className={clsx(
                      "mx-0.5 h-1.5 shrink-0 rounded-full lg:hidden",
                      dayDotClass(s.dayIndex),
                    )}
                  />
                  <span
                    className={clsx(
                      "sr-only",
                      i < VISIBLE_MARKS &&
                        "lg:not-sr-only lg:truncate lg:rounded-sm lg:border-l-[3px] lg:px-1 lg:text-xs lg:leading-5",
                      dayChipClass(s.dayIndex),
                    )}
                  >
                    {s.dayName ?? "Ad hoc"}
                  </span>
                </span>
              ))}
              {hidden > 0 && (
                <span
                  aria-hidden
                  className="hidden px-1 text-xs text-ink-muted lg:inline"
                >
                  +{hidden}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <Legend
        sessions={days.flatMap((d) => props.sessionsByDate.get(d) ?? [])}
      />
    </section>
  );
}

/** Which color is which day, for the bars that stand in for names on phones. */
function Legend(props: { sessions: CalendarSession[] }) {
  const entries = new Map<string, number | null>();
  for (const s of props.sessions) {
    entries.set(s.dayName ?? "Ad hoc", s.dayName ? s.dayIndex : null);
  }
  if (entries.size === 0) return null;
  return (
    <ul
      aria-hidden
      className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-sm text-ink-muted lg:hidden"
    >
      {[...entries].map(([name, dayIndex]) => (
        <li key={name} className="flex items-center gap-1.5">
          <span
            className={clsx("h-1.5 w-3.5 rounded-full", dayDotClass(dayIndex))}
          />
          {name}
        </li>
      ))}
    </ul>
  );
}
