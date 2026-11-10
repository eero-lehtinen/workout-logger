import {
  type DateRange,
  type IsoDate,
  type TrainingStats,
  type WeekStart,
  weeklyAverages,
} from "@workout-logger/core";
import { MUSCLE_GROUPS } from "@workout-logger/exercises";
import { Switch } from "../../components/switch.tsx";
import { dateFromIso } from "../../lib/format.ts";
import { useSwitchPreference } from "../../lib/preference.ts";

const one = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const shortDate = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Weekly weighted sets per muscle group, optionally with its muscles below. */
export function MuscleSets(props: {
  sessions: (TrainingStats["sessions"][number] & { date: IsoDate })[];
  muscles: TrainingStats["muscles"];
  range: DateRange;
  weekStart: WeekStart;
}) {
  const { sessions, muscles, range, weekStart } = props;
  const [showMuscles, setShowMuscles] = useSwitchPreference(
    "history-show-muscles",
    false,
  );
  const known: readonly string[] = MUSCLE_GROUPS;
  const present = [...new Set(muscles.map((m) => m.group))];
  const groupOrder = [
    ...known.filter((g) => present.includes(g)),
    ...present.filter((g) => !known.includes(g)),
  ];
  const groups = weeklyAverages(
    sessions.map((s) => ({ date: s.date, amounts: s.weightedSets.groups })),
    groupOrder,
    range,
    weekStart,
  );
  const byMuscle = new Map(
    weeklyAverages(
      sessions.map((s) => ({ date: s.date, amounts: s.weightedSets.muscles })),
      muscles.map((m) => m.id),
      range,
      weekStart,
    ).map((m) => [m.key, m]),
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2 pt-6 pb-1">
        <h3 className="font-semibold">Muscles</h3>
        <span className="flex items-center gap-2 text-sm text-ink-muted">
          <span aria-hidden>Show muscles</span>
          <Switch
            label="Show muscles"
            checked={showMuscles}
            onChange={setShowMuscles}
          />
        </span>
      </div>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="text-sm text-ink-muted">
            <th scope="col" className="py-1 font-normal">
              Group
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Sets per week
            </th>
            <th scope="col" className="py-1 pl-4 text-right font-normal">
              Last trained
            </th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.key} className="border-t border-rule">
            <Row name={g.key} perWeek={g.perWeek} lastDate={g.lastDate} />
            {muscles
              .filter((m) => showMuscles && m.group === g.key)
              .map((m) => {
                const muscle = byMuscle.get(m.id);
                return (
                  <Row
                    key={m.id}
                    name={m.name}
                    perWeek={muscle?.perWeek ?? 0}
                    lastDate={muscle?.lastDate ?? null}
                    muscle
                  />
                );
              })}
          </tbody>
        ))}
      </table>
      <p className="pt-1 text-xs text-ink-muted">
        Weighted sets per week: a set counts fully for a primary muscle and by
        half for a secondary one. In a group, each set counts once, by its
        largest share.
      </p>
    </>
  );
}

function Row(props: {
  name: string;
  perWeek: number;
  lastDate: IsoDate | null;
  /** A muscle under its group: indented and quieter. */
  muscle?: boolean;
}) {
  return (
    <tr className={props.muscle ? "text-sm text-ink-muted" : undefined}>
      <th
        scope="row"
        className={
          props.muscle ? "py-0.5 pl-4 font-normal" : "pt-1.5 pb-0.5 font-medium"
        }
      >
        {props.name}
      </th>
      <td className="tabular py-0.5 text-right">{one.format(props.perWeek)}</td>
      <td className="tabular py-0.5 pl-4 text-right text-ink-muted">
        {props.lastDate ? shortDate.format(dateFromIso(props.lastDate)) : "–"}
      </td>
    </tr>
  );
}
