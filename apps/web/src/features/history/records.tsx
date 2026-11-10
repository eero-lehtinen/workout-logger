import { Link } from "@tanstack/react-router";
import type {
  ExerciseHistory,
  RecordAt,
  WeightUnit,
} from "@workout-logger/core";
import { clsx } from "clsx";
import { useState } from "react";
import { Segmented } from "../../components/segmented.tsx";
import {
  formatSessionDate,
  formatSet,
  formatWeightWithUnit,
} from "../../lib/format.ts";
import { formatHeadline, HEADLINE_LABELS, isWeighted } from "./metrics.ts";

type Table = "reps" | "weight";

export function RecordsSection(props: {
  history: ExerciseHistory;
  unit: WeightUnit;
}) {
  const { history, unit } = props;
  const { records, exercise } = history;
  const [table, setTable] = useState<Table>("reps");
  return (
    <section className="px-4 lg:px-0">
      <h2 className="pb-2 text-lg font-semibold">Records</h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {records.headline.map((r) => (
          <li
            key={r.kind}
            className="rounded-xl bg-raised p-3 ring-1 ring-rule"
          >
            <p className="text-sm text-ink-muted">{HEADLINE_LABELS[r.kind]}</p>
            <p className="numerals text-2xl">
              {formatHeadline(r.kind, r.value, unit)}
            </p>
            <p className="text-sm text-ink-muted">
              {r.set && `${formatSet(r.set, exercise.type, unit)}, `}
              <RecordDate at={r.at} />
            </p>
          </li>
        ))}
      </ul>

      {isWeighted(exercise.type) && records.byReps.length > 0 && (
        <div className="pt-5">
          <Segmented
            label="Records table"
            size="sm"
            value={table}
            onChange={setTable}
            options={[
              { value: "reps", label: "Best weight for reps" },
              { value: "weight", label: "Most reps at weight" },
            ]}
          />
          {table === "reps" ? (
            <RecordTable
              head={["Reps", "Weight", "e1RM", "Date"]}
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
              head={["Weight", "Reps", "Date"]}
              rows={records.byWeight.map((r) => ({
                key: String(r.weightKg),
                beaten: r.beaten,
                at: r.at,
                cells: [formatWeightWithUnit(r.weightKg, unit), String(r.reps)],
              }))}
            />
          )}
          <p className="pt-1 text-xs text-ink-muted">
            Dimmed rows were beaten by a set with more weight and as many reps.
          </p>
        </div>
      )}
    </section>
  );
}

function RecordTable(props: {
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
              <RecordDate at={row.at} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RecordDate({ at }: { at: RecordAt }) {
  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: at.sessionId }}
      className="underline decoration-rule underline-offset-2 hover:decoration-ink"
    >
      {formatSessionDate(at.startedAt, at.tz)}
    </Link>
  );
}
