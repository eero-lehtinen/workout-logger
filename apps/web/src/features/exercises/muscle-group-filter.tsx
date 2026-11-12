import { MUSCLE_GROUPS } from "@workout-logger/exercises";
import { useTranslation } from "react-i18next";
import { Chip } from "../../components/chip.tsx";
import { muscleGroupName } from "./muscles.ts";

/**
 * Chips that pick one muscle group, or all exercises with `null`. On phones
 * they scroll sideways in one row, so the header stays short; the row runs
 * to the screen's edges. Its vertical padding leaves room for the selected
 * chip's shadow, which the scrolling box would otherwise clip.
 */
export function MuscleGroupFilter(props: {
  value: string | null;
  onChange: (group: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="-mx-4 -my-1.5 flex gap-1.5 overflow-x-auto px-4 py-1.5 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
      {[null, ...MUSCLE_GROUPS].map((g) => (
        <Chip
          key={g ?? "all"}
          pressed={props.value === g}
          onClick={() => props.onChange(g)}
        >
          {g === null ? t("exercises.filter.all") : muscleGroupName(g)}
        </Chip>
      ))}
    </div>
  );
}
