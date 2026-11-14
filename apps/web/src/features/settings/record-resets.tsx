import type { IsoDate } from "@workout-logger/core";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, IconButton } from "../../components/button.tsx";
import { useCommand } from "../../db/react.tsx";
import { dateFormat, dateFromIso, todayIso } from "../../lib/format.ts";
import { SHORT_DATE } from "../history/format-options.ts";
import { Row } from "./settings-rows.tsx";

/** Rows to add a record reset, and one row per reset, newest first. */
export function RecordResets(props: { resets: readonly IsoDate[] }) {
  const { t } = useTranslation();
  const command = useCommand();
  const today = todayIso();
  const [date, setDate] = useState<IsoDate>(today);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;
  const format = (d: IsoDate) => dateFormat(SHORT_DATE).format(dateFromIso(d));
  const newestFirst = [...props.resets].reverse();

  return (
    <>
      <Row
        stacked
        label={t("settings.records.reset")}
        hint={t("settings.records.resetHint")}
      >
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label={t("settings.records.resetDate")}
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="tabular h-10 rounded-xl bg-chalk px-3 font-semibold outline-none ring-1 ring-rule focus:ring-2 focus:ring-ink"
          />
          <Button
            disabled={!valid || props.resets.includes(date)}
            onClick={() =>
              command(
                "addRecordReset",
                { date },
                {
                  undoLabel: t("settings.records.added", {
                    date: format(date),
                  }),
                },
              )
            }
          >
            {t("settings.records.add")}
          </Button>
        </div>
      </Row>
      {newestFirst.map((reset, i) => (
        <Row
          key={reset}
          label={t("settings.records.since", { date: format(reset) })}
          hint={
            i === 0
              ? t("settings.records.current")
              : t("settings.records.until", {
                  date: format(newestFirst[i - 1] ?? reset),
                })
          }
        >
          <IconButton
            label={t("settings.records.remove", { date: format(reset) })}
            variant="danger"
            onClick={() =>
              command(
                "removeRecordReset",
                { date: reset },
                {
                  undoLabel: t("settings.records.removed", {
                    date: format(reset),
                  }),
                },
              )
            }
          >
            <Trash2 size={17} />
          </IconButton>
        </Row>
      ))}
    </>
  );
}
