import {
  addDays,
  type IsoDate,
  type ListedSession,
  type WeekStart,
  weekOf,
} from "@workout-logger/core";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, IconButton } from "../../components/button.tsx";
import { SectionHeading } from "../../components/headings.tsx";
import { dateFromIso } from "../../lib/format.ts";
import { useMediaQuery, WIDE } from "../../lib/use-media-query.ts";
import { dayChipClass, dayDotClass } from "./day-colors.ts";

/** Marks shown in a day cell before "+n". */
const VISIBLE_MARKS = 2;
/** Dots fit more than named marks. */
const VISIBLE_DOTS = 3;

/**
 * Six weeks from the week of `month`'s (`YYYY-MM`) first day. Always six, the
 * most any month spans, so the calendar keeps its height between months.
 */
export function monthGrid(month: string, weekStart: WeekStart): IsoDate[] {
  const first = weekOf(`${month}-01`, weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function shiftMonth(month: string, months: number): string {
  return Temporal.PlainYearMonth.from(month).add({ months }).toString();
}

const utc = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" });
const monthTitle = utc({ month: "long", year: "numeric" });
const weekday = utc({ weekday: "short" });
const dayLabel = utc({ weekday: "long", day: "numeric", month: "long" });

/**
 * A month of days with their sessions. On wide screens each session is a
 * named mark. On phones the month is compact, with a colored dot per
 * session, so the chosen day's sessions show without scrolling.
 */
export function MonthCalendar(props: {
  month: string;
  weekStart: WeekStart;
  sessionsByDate: ReadonlyMap<IsoDate, ListedSession[]>;
  today: IsoDate;
  selected: IsoDate | null;
  onSelect: (date: IsoDate) => void;
  onMonth: (month: string) => void;
}) {
  const dots = !useMediaQuery(WIDE);
  const thisMonth = props.today.slice(0, 7);
  const days = monthGrid(props.month, props.weekStart);

  return (
    <section aria-label="Calendar">
      <div className="flex items-center gap-1 px-2 pb-2 lg:px-0">
        <SectionHeading inset={false} className="flex-1 pb-0 pl-2 lg:pl-0">
          {monthTitle.format(dateFromIso(`${props.month}-01`))}
        </SectionHeading>
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
      <div aria-hidden className="grid grid-cols-7 px-1 lg:px-0">
        {days.slice(0, 7).map((d) => (
          <div
            key={d}
            className="pb-1 text-center text-xs font-medium text-ink-muted"
          >
            {weekday.format(dateFromIso(d))}
          </div>
        ))}
      </div>
      {/* The 1px gaps over the rule-colored grid draw the cell borders. */}
      <div className="mx-1 grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-rule bg-rule lg:mx-0">
        {days.map((d) => {
          const sessions = props.sessionsByDate.get(d) ?? [];
          const inMonth = d.startsWith(props.month);
          const shown = dots ? VISIBLE_DOTS : VISIBLE_MARKS;
          const hidden = sessions.length - shown;
          const selected = d === props.selected;
          return (
            <button
              key={d}
              type="button"
              onClick={() => props.onSelect(d)}
              aria-pressed={selected}
              // Fixed height: the day number and the marks fit, and "+n"
              // sits beside the number, so sessions never stretch a row.
              className={clsx(
                "relative flex min-w-0 flex-col gap-0.5 overflow-hidden p-0.5 text-left hover:bg-surface aria-pressed:bg-selected lg:h-22 lg:p-1.5",
                dots ? "h-12 items-center" : "h-16",
                inMonth ? "bg-raised" : "bg-recessed",
              )}
            >
              <span className="sr-only">
                {dayLabel.format(dateFromIso(d))}
                {sessions.length > 0 && ":"}
              </span>
              <span
                aria-hidden
                className={clsx(
                  "tabular flex size-6 shrink-0 items-center justify-center rounded-full text-sm",
                  selected
                    ? "bg-ink font-semibold text-chalk"
                    : d === props.today &&
                        "font-semibold text-ink ring-[1.5px] ring-ink",
                  !selected && !inMonth && "text-ink-muted",
                )}
              >
                {Number(d.slice(8))}
              </span>
              {dots ? (
                <span className="flex items-center gap-1 pt-0.5">
                  {sessions.slice(0, VISIBLE_DOTS).map((s) => (
                    <span
                      key={s.id}
                      className={clsx(
                        "size-1.5 rounded-full",
                        dayDotClass(s.dayIndex),
                      )}
                    >
                      <span className="sr-only">{s.dayName ?? "Ad hoc"}</span>
                    </span>
                  ))}
                </span>
              ) : (
                sessions.slice(0, VISIBLE_MARKS).map((s) => (
                  <span
                    key={s.id}
                    // Clipped, not ellipsized: on a phone an ellipsis would
                    // leave a letter or two, while clipping shows what fits.
                    className={clsx(
                      "w-full overflow-hidden rounded-sm border-l-2 pl-0.5 text-[0.6875rem] leading-4 whitespace-nowrap lg:border-l-[3px] lg:px-1 lg:text-xs lg:leading-5",
                      dayChipClass(s.dayIndex),
                    )}
                  >
                    {s.dayName ?? "Ad hoc"}
                  </span>
                ))
              )}
              {hidden > 0 && (
                <span className="absolute top-0.5 right-0.5 text-[0.6875rem] leading-6 text-ink-muted lg:top-1.5 lg:right-1.5 lg:text-xs">
                  +{hidden}
                  <span className="sr-only"> more</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
