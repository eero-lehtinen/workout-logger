import { ArrowDownUp } from "lucide-react";
import { Select } from "../../components/select.tsx";
import { EXERCISE_SORTS, useExerciseSort } from "./sort.ts";

/** The exercise order, compact enough to sit beside the search field. */
export function ExerciseSortSelect() {
  const [sort, setSort] = useExerciseSort();
  return (
    <Select
      label="Sort exercises"
      size="lg"
      icon={<ArrowDownUp size={16} />}
      value={sort}
      onChange={setSort}
      options={EXERCISE_SORTS}
    />
  );
}
