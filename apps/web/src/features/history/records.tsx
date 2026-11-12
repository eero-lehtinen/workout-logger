import { Link } from "@tanstack/react-router";
import type {
  ExerciseHistory,
  RecordAt,
  WeightUnit,
} from "@workout-logger/core";
import { clsx } from "clsx";
import { useTranslation } from "react-i18next";
import { SectionHeading } from "../../components/headings.tsx";
import { Segmented } from "../../components/segmented.tsx";
import {
  formatSessionDate,
  formatSet,
  formatWeightWithUnit,
} from "../../lib/format.ts";
import { usePreference } from "../../lib/preference.ts";
import { formatHeadline, headlineLabel, isWeighted } from "./metrics.ts";
import { type Period, periodRecordsTitle } from "./period.ts";

const TABLES = ["reps", "weight"] as const;
type Table = (typeof TABLES)[number];

export function RecordsSection(props: {
  history: ExerciseHistory;
  unit: WeightUnit;
  period: Period;
}) {
  const { history, unit } = props;
  const { records, exercise } = history;
  const { t } = useTranslation();
  const [table, setTable] = usePreference<Table>(
    "history-records-table",
    TABLES,
    "reps",
  );
  return (
    <section className="px-4 lg:px-0">
      <SectionHeading inset={false}>
        {periodRecordsTitle(props.period)}
      </SectionHeading>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {records.headline.map((r) => (
          <li
            key={r.kind}
            className="rounded-2xl bg-raised p-3 ring-1 ring-rule"
          >
            <p className="text-sm text-ink-muted">{headlineLabel(r.kind)}</p>
            <p className="numerals text-2xl">
              {formatHeadline(r.kind, r.value, unit)}
            </p>
            <p className="text-sm text-ink-muted">
              {r.set && `${formatSet(r.set, exercise.type, unit)}, `}
              <RecordDate at={r.at} exerciseId={exercise.id} />
            </p>
          </li>
        ))}
      </ul>

      {isWeighted(exercise.type) && records.byReps.length > 0 && (
        <div className="pt-5">
          <Segmented
            label={t("history.records.tableLabel")}
            size="sm"
            value={table}
            onChange={setTable}
            options={[
              { value: "reps", label: t("history.records.bestWeightForReps") },
              { value: "weight", label: t("history.records.mostRepsAtWeight") },
            ]}
          />
          {table === "reps" ? (
            <RecordTable
              exerciseId={exercise.id}
              head={[
                t("history.records.reps"),
                t("history.records.weight"),
                "e1RM",
                t("history.records.date"),
              ]}
              rows={records.byReps.map((r) => ({
                key: String(r.reps),
                beaten: r.beaten,
                at: r.at,
                cells: [
                  String(r.reps),
                  formatWeightWithUnit(r.weightKg, unit),
                  r.e1rmKg === null
                    ? "–"
                    : formatHeadline("e1rm", r.e1rmKg, unit),
                ],
              }))}
            />
          ) : (
            <RecordTable
              exerciseId={exercise.id}
              head={[
                t("history.records.weight"),
                t("history.records.reps"),
                t("history.records.date"),
              ]}
              rows={records.byWeight.map((r) => ({
                key: String(r.weightKg),
                beaten: r.beaten,
                at: r.at,
                cells: [formatWeightWithUnit(r.weightKg, unit), String(r.reps)],
              }))}
            />
          )}
          <p className="pt-1 text-xs text-ink-muted">
            {t("history.records.dimmedNote")}
          </p>
        </div>
      )}
    </section>
  );
}

function RecordTable(props: {
  exerciseId: string;
  head: string[];
  rows: { key: string; beaten: boolean; at: RecordAt; cells: string[] }[];
}) {
  return (
    <table className="mt-2 w-full border-collapse text-left">
      <thead>
        <tr className="text-sm text-ink-muted">
          {props.head.map((h) => (
            <th key={h} scope="col" className="py-1 pr-3 font-normal">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr
            key={row.key}
            className={clsx(
              "border-t border-rule",
              row.beaten && "text-ink-muted",
            )}
          >
            {row.cells.map((cell, i) => (
              <td
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed columns
                key={i}
                className={clsx(
                  "tabular py-1.5 pr-3",
                  i === 0 && "font-medium",
                )}
              >
                {cell}
              </td>
            ))}
            <td className="py-1.5 text-sm">
              <RecordDate at={row.at} exerciseId={props.exerciseId} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Opens the session; its back button returns to this exercise. */
function RecordDate({ at, exerciseId }: { at: RecordAt; exerciseId: string }) {
  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: at.sessionId }}
      search={{ exerciseId }}
      className="underline decoration-rule underline-offset-2 hover:decoration-ink"
    >
      {formatSessionDate(at.startedAt, at.tz)}
    </Link>
  );
}
