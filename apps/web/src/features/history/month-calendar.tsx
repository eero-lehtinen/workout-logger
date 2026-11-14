import {
  addDays,
  type IsoDate,
  type ListedSession,
  type WeekStart,
  weekOf,
} from "@workout-logger/core";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, IconButton } from "../../components/button.tsx";
import { dateFormat, dateFromIso } from "../../lib/format.ts";
import { useMediaQuery, WIDE } from "../../lib/use-media-query.ts";
import { dayForKey } from "./calendar-keys.ts";
import { dayChipClass, dayDotClass } from "./day-colors.ts";
import { MonthPicker } from "./month-picker.tsx";

/** Marks shown in a day cell before "+n". */
const VISIBLE_MARKS = 2;
/** Dots fit more than named marks. */
const VISIBLE_DOTS = 3;
/** Horizontal travel, in CSS pixels, that makes a touch a swipe. */
const SWIPE_DISTANCE = 48;

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
  dateFormat({ ...options, timeZone: "UTC" });

/**
 * A month of days with their sessions. On wide screens each session is a
 * named mark. On phones the month is compact, with a colored dot per
 * session, so the chosen day's sessions show without scrolling.
 *
 * The month changes with the arrows, the month picker under the title, a
 * horizontal swipe on touch screens, or by choosing a day outside it. The
 * days are a single tab stop: arrow keys, PageUp/PageDown and Home/End move
 * the selection.
 */
export function MonthCalendar(props: {
  month: string;
  weekStart: WeekStart;
  sessionsByDate: ReadonlyMap<IsoDate, ListedSession[]>;
  /** Sessions per `YYYY-MM`, for the month picker. */
  monthCounts: ReadonlyMap<string, number>;
  firstYear: number;
  today: IsoDate;
  selected: IsoDate | null;
  onSelect: (date: IsoDate) => void;
  onMonth: (month: string) => void;
}) {
  const { t } = useTranslation();
  const dots = !useMediaQuery(WIDE);
  const thisMonth = props.today.slice(0, 7);
  const days = monthGrid(props.month, props.weekStart);
  const weekday = utc({ weekday: "short" });
  const dayLabel = utc({ weekday: "long", day: "numeric", month: "long" });
  const tabStop =
    [props.selected, props.today].find((d) => d && days.includes(d)) ??
    `${props.month}-01`;

  const [shownMonth, setShownMonth] = useState(props.month);
  const [slide, setSlide] = useState<"next" | "prev" | null>(null);
  if (shownMonth !== props.month) {
    setSlide(props.month > shownMonth ? "next" : "prev");
    setShownMonth(props.month);
  }

  const gridRef = useRef<HTMLFieldSetElement>(null);
  // Set by a key press, cleared once the selected day's cell, which may be in
  // a month still loading, has focus.
  const focusSelected = useRef(false);
  useEffect(() => {
    if (!focusSelected.current || !props.selected) return;
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-date="${props.selected}"]`)
      ?.focus();
    if (props.selected.startsWith(props.month)) focusSelected.current = false;
  }, [props.selected, props.month]);

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  // The click a swipe ends with would select the day it ended on.
  const swiped = useRef(false);
  const onPointerUp = (e: PointerEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > 2 * Math.abs(dy)) {
      swiped.current = true;
      props.onMonth(shiftMonth(props.month, dx < 0 ? 1 : -1));
    }
  };

  return (
    <section aria-label={t("history.calendar.label")}>
      <div className="flex items-center gap-1 px-2 pb-2 lg:px-0">
        <MonthPicker
          month={props.month}
          thisMonth={thisMonth}
          counts={props.monthCounts}
          firstYear={props.firstYear}
          onMonth={props.onMonth}
        />
        {props.selected !== props.today && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => props.onSelect(props.today)}
          >
            {t("history.calendar.today")}
          </Button>
        )}
        <IconButton
          label={t("history.calendar.previousMonth")}
          onClick={() => props.onMonth(shiftMonth(props.month, -1))}
        >
          <ChevronLeft size={20} />
        </IconButton>
        <IconButton
          label={t("history.calendar.nextMonth")}
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
      <fieldset
        key={props.month}
        ref={gridRef}
        aria-label={utc({ month: "long", year: "numeric" }).format(
          dateFromIso(`${props.month}-01`),
        )}
        className={clsx(
          "mx-1 grid min-w-0 touch-pan-y grid-cols-7 gap-px overflow-hidden rounded-2xl border border-rule bg-rule lg:mx-0",
          slide === "next" && "animate-month-next",
          slide === "prev" && "animate-month-prev",
        )}
        onKeyDown={(e) => {
          if (e.altKey || e.ctrlKey || e.metaKey) return;
          const date = (e.target as HTMLElement).closest<HTMLElement>(
            "[data-date]",
          )?.dataset.date;
          const next =
            date && dayForKey(date, e.key, e.shiftKey, props.weekStart);
          if (!next) return;
          e.preventDefault();
          focusSelected.current = true;
          props.onSelect(next);
        }}
        onPointerDown={(e) => {
          swiped.current = false;
          touchStart.current =
            e.pointerType === "mouse" ? null : { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={onPointerUp}
        // A vertical scroll cancels the pointer, so it never counts as a swipe.
        onPointerCancel={() => {
          touchStart.current = null;
        }}
        onClickCapture={(e) => {
          // A keyboard click has detail 0. A swipe often ends without a
          // click at all, leaving `swiped` set until the next pointerdown.
          if (!swiped.current || e.detail === 0) return;
          swiped.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
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
              data-date={d}
              tabIndex={d === tabStop ? 0 : -1}
              onClick={() => props.onSelect(d)}
              aria-pressed={selected}
              // Fixed height: the day number and the marks fit, and "+n"
              // sits beside the number, so sessions never stretch a row.
              // The outline is inset, as the grid clips the cells.
              className={clsx(
                "relative flex min-w-0 flex-col gap-0.5 overflow-hidden p-0.5 text-left hover:bg-surface focus-visible:-outline-offset-2 aria-pressed:bg-selected lg:h-22 lg:p-1.5",
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
                <span className="flex w-full flex-1 items-center justify-center gap-0.5 px-1">
                  {sessions.slice(0, VISIBLE_DOTS).map((s) => (
                    <span
                      key={s.id}
                      className={clsx(
                        "h-1.5 max-w-6 min-w-0 flex-1 rounded-full",
                        dayDotClass(s.dayIndex),
                      )}
                    >
                      <span className="sr-only">
                        {s.dayName ?? t("history.adHoc")}
                      </span>
                    </span>
                  ))}
                </span>
              ) : (
                sessions.slice(0, VISIBLE_MARKS).map((s) => (
                  <span
                    key={s.id}
                    // Marks share the height under the day number, so a
                    // single session fills the day. Long names wrap, and what
                    // doesn't fit is clipped: an ellipsis in a narrow cell
                    // would leave only a letter or two.
                    className={clsx(
                      "min-h-0 w-full flex-1 overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-sm leading-5 font-medium",
                      dayChipClass(s.dayIndex),
                    )}
                  >
                    {s.dayName ?? t("history.adHoc")}
                  </span>
                ))
              )}
              {hidden > 0 && (
                <span className="absolute top-0.5 right-0.5 text-[0.6875rem] leading-6 text-ink-muted lg:top-1.5 lg:right-1.5 lg:text-xs">
                  +{hidden}
                  <span className="sr-only"> {t("history.calendar.more")}</span>
                </span>
              )}
            </button>
          );
        })}
      </fieldset>
    </section>
  );
}
