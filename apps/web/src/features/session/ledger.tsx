import type { ExerciseLog, LoggedSet } from "@workout-logger/core";
import { clsx } from "clsx";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SetText } from "../../components/set-text.tsx";
import { formatSessionDate, formatSet } from "../../lib/format.ts";
import { Marker } from "./marker.tsx";

/** Rows share the table's columns, so a row can have a background. */
const subgrid = "col-span-full grid grid-cols-subgrid";

/**
 * Last time's sets beside today's, row by row, read left to right in time
 * order. A weight increase on set n is judged against set n of the previous
 * performance, so the pairing is that comparison; a set record is judged
 * against every earlier set n. Last time's markers are left out: they are
 * about that session, and next to today's they would read as today's.
 */
export function Ledger(props: {
  log: ExerciseLog;
  unit: "kg" | "lb";
  /** The set being edited in the footer, highlighted here. */
  editingId: string | null;
  onEdit: (set: LoggedSet) => void;
  onStopEditing: () => void;
  onCopy: (set: LoggedSet) => void;
}) {
  const { log, unit } = props;
  const { t } = useTranslation();
  const type = log.exercise.type;
  const previous = log.previous[0];
  const rows = Math.max(log.sets.length + 1, previous?.sets.length ?? 0);

  return (
    // Last time's column is as wide as its sets, so today's larger figures
    // get the rest. The width cap keeps each pair together on a wide pane.
    <table
      className={clsx(
        "grid w-full max-w-[30rem]",
        previous
          ? "grid-cols-[auto_auto_auto_minmax(0,1fr)]"
          : "grid-cols-[auto_minmax(0,1fr)]",
      )}
    >
      <thead className={subgrid}>
        <tr
          className={clsx(
            subgrid,
            "items-end pb-1 text-left text-sm text-ink-muted",
          )}
        >
          <th scope="col" className="w-7 font-normal">
            <span className="sr-only">{t("session.ledger.set")}</span>
          </th>
          {previous && (
            <>
              <th scope="col" className="pr-2 font-normal">
                {t("session.ledger.lastTime")}
                <span className="block text-xs">
                  {formatSessionDate(previous.startedAt, previous.tz)}
                </span>
              </th>
              <td />
            </>
          )}
          <th scope="col" className="font-normal">
            {t("session.ledger.today")}
          </th>
        </tr>
      </thead>
      <tbody className={subgrid}>
        {Array.from({ length: rows }, (_, i) => {
          const today = log.sets[i];
          const before = previous?.sets[i];
          const isNext = i === log.sets.length;
          return (
            <tr
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are set numbers
              key={i}
              className={clsx(
                subgrid,
                "min-h-14 items-center rounded-xl py-1",
                isNext && "bg-surface",
              )}
            >
              <td className="tabular pl-2 text-sm text-ink-muted">{i + 1}</td>
              {previous && (
                <>
                  <td className="pr-2">
                    {before && (
                      <button
                        type="button"
                        onClick={() => props.onCopy(before)}
                        aria-label={t("session.ledger.useForNext", {
                          set: formatSet(before, type, unit),
                        })}
                        className="-ml-1.5 flex h-12 items-center rounded-xl px-1.5 text-left whitespace-nowrap text-ink-muted hover:bg-ink/8 hover:text-ink"
                      >
                        <span className="numerals text-lg">
                          <SetText set={before} type={type} unit={unit} />
                        </span>
                      </button>
                    )}
                  </td>
                  <td aria-hidden className="pr-2 text-ink-muted/60">
                    {before && (today || isNext) && <ArrowRight size={16} />}
                  </td>
                </>
              )}
              <td className="min-w-0">
                {today ? (
                  <div className="-ml-1.5 flex items-center">
                    <button
                      type="button"
                      onClick={() => props.onEdit(today)}
                      aria-pressed={props.editingId === today.id}
                      aria-label={t("session.ledger.editSet", {
                        number: i + 1,
                        set: formatSet(today, type, unit),
                      })}
                      className="flex h-12 min-w-0 items-center rounded-xl px-1.5 text-left hover:bg-surface aria-pressed:bg-selected aria-pressed:ring-2 aria-pressed:ring-ink/50"
                    >
                      <span className="numerals truncate text-2xl">
                        <SetText set={today} type={type} unit={unit} />
                      </span>
                    </button>
                    <Marker
                      marker={today.marker}
                      basis={today.markerBasis}
                      type={type}
                      unit={unit}
                    />
                  </div>
                ) : isNext && props.editingId ? (
                  <button
                    type="button"
                    onClick={props.onStopEditing}
                    aria-label={t("session.ledger.stopEditing")}
                    className="-ml-1.5 flex h-12 items-center rounded-xl px-1.5 text-xl font-semibold hover:bg-ink/8"
                  >
                    {t("session.ledger.next")}
                  </button>
                ) : (
                  isNext && (
                    <span className="flex h-12 items-center text-xl font-semibold">
                      {t("session.ledger.next")}
                    </span>
                  )
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
