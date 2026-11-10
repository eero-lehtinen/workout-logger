import { ArrowDownUp } from "lucide-react";
import { Select } from "../../components/select.tsx";
import { EXERCISE_SORTS, useExerciseSort } from "./sort.ts";

/** The exercise order, compact enough for a row of filter chips. */
export function ExerciseSortSelect(props: { className?: string }) {
  const [sort, setSort] = useExerciseSort();
  return (
    <Select
      label="Sort exercises"
      size="sm"
      icon={<ArrowDownUp size={15} />}
      value={sort}
      onChange={setSort}
      options={EXERCISE_SORTS}
      className={props.className}
    />
  );
}
