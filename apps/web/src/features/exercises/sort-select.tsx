import { ArrowDownUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Select } from "../../components/select.tsx";
import { EXERCISE_SORTS, useExerciseSort } from "./sort.ts";

/**
 * The exercise order, compact enough to sit beside the search field: the
 * option labels are short, and a sort icon says what the choice does.
 */
export function ExerciseSortSelect() {
  const { t } = useTranslation();
  const [sort, setSort] = useExerciseSort();
  return (
    <Select
      label={t("exercises.sort.label")}
      size="lg"
      icon={<ArrowDownUp size={16} />}
      value={sort}
      onChange={setSort}
      options={EXERCISE_SORTS.map((value) => ({
        value,
        label: t(`exercises.sort.${value}`),
      }))}
    />
  );
}
