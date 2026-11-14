import { Popover } from "@base-ui/react/popover";
import { clsx } from "clsx";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "../../components/button.tsx";
import { dateFormat, dateFromIso } from "../../lib/format.ts";
import { usePopupCollisionPadding } from "../../lib/safe-area.ts";

const utc = (options: Intl.DateTimeFormatOptions) =>
  dateFormat({ ...options, timeZone: "UTC" });

/**
 * The calendar's month title, which opens a grid of a year's months with
 * their session counts, so a month years back is a few taps away. Years run
 * from the first session's to this year's; months after this one are
 * disabled, as they can't have sessions.
 */
export function MonthPicker(props: {
  month: string;
  thisMonth: string;
  /** Sessions per `YYYY-MM`. */
  counts: ReadonlyMap<string, number>;
  firstYear: number;
  onMonth: (month: string) => void;
}) {
  const { t } = useTranslation();
  const collisionPadding = usePopupCollisionPadding();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number(props.month.slice(0, 4)));
  const shownRef = useRef<HTMLButtonElement>(null);
  const lastYear = Number(props.thisMonth.slice(0, 4));
  const monthTitle = utc({ month: "long", year: "numeric" });
  const shortMonth = utc({ month: "short" });
  const firstDay = dateFromIso(`${props.month}-01`);
  const title = monthTitle.format(firstDay);
  const months = Array.from(
    { length: 12 },
    (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`,
  );

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setYear(Number(props.month.slice(0, 4)));
        setOpen(next);
      }}
    >
      <h2 className="min-w-0 flex-1">
        <Popover.Trigger
          aria-label={`${title}, ${t("history.calendar.chooseMonth")}`}
          className="inline-flex h-10 max-w-full items-center gap-1 rounded-xl px-2 text-lg font-semibold hover:bg-surface data-popup-open:bg-surface lg:-ml-2"
        >
          {/* The long name doesn't fit beside "Today" and the arrows on
              narrow phones: "marraskuu 2026" needs 331px of the row's
              content width. */}
          <span className="truncate @min-[21rem]:hidden">
            {utc({ month: "short", year: "numeric" }).format(firstDay)}
          </span>
          <span className="hidden truncate @min-[21rem]:inline">{title}</span>
          <ChevronDown
            aria-hidden
            size={18}
            className="shrink-0 text-ink-muted"
          />
        </Popover.Trigger>
      </h2>
      <Popover.Portal>
        <Popover.Positioner
          className="z-50 outline-none"
          sideOffset={4}
          align="start"
          collisionPadding={collisionPadding}
        >
          <Popover.Popup
            initialFocus={shownRef}
            className="w-72 origin-[var(--transform-origin)] rounded-2xl bg-raised p-2 text-ink shadow-lg ring-1 ring-rule transition-[scale,opacity] duration-100 ease-out outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          >
            <div className="flex items-center pb-1">
              <IconButton
                label={t("history.calendar.previousYear")}
                disabled={year <= props.firstYear}
                onClick={() => setYear(year - 1)}
              >
                <ChevronLeft size={20} />
              </IconButton>
              <Popover.Title className="tabular flex-1 text-center font-semibold">
                {year}
              </Popover.Title>
              <IconButton
                label={t("history.calendar.nextYear")}
                disabled={year >= lastYear}
                onClick={() => setYear(year + 1)}
              >
                <ChevronRight size={20} />
              </IconButton>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {months.map((m) => {
                const count = props.counts.get(m) ?? 0;
                const shown = m === props.month;
                const date = dateFromIso(`${m}-01`);
                return (
                  <button
                    key={m}
                    ref={shown ? shownRef : undefined}
                    type="button"
                    disabled={m > props.thisMonth}
                    aria-pressed={shown}
                    aria-label={`${monthTitle.format(date)}: ${t(
                      "history.frequency.sessionCount",
                      { count },
                    )}`}
                    onClick={() => {
                      props.onMonth(m);
                      setOpen(false);
                    }}
                    className={clsx(
                      "flex h-14 flex-col items-center justify-center rounded-xl text-[0.9375rem] transition-colors disabled:opacity-30",
                      shown
                        ? "bg-ink font-semibold text-chalk"
                        : "hover:bg-surface",
                      !shown &&
                        m === props.thisMonth &&
                        "font-semibold ring-[1.5px] ring-ink ring-inset",
                    )}
                  >
                    <span aria-hidden>{shortMonth.format(date)}</span>
                    <span
                      aria-hidden
                      className={clsx(
                        "tabular text-xs",
                        shown ? "text-chalk/75" : "text-ink-muted",
                      )}
                    >
                      {count > 0 ? count : " "}
                    </span>
                  </button>
                );
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
