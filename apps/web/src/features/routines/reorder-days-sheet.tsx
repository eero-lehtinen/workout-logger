import type { RoutineDetail } from "@workout-logger/core";
import { useTranslation } from "react-i18next";
import { Sheet } from "../../components/sheet.tsx";
import { GripHandle, SortableList } from "../../components/sortable.tsx";
import { useCommand } from "../../db/react.tsx";
import { dayDotClass } from "../history/day-colors.ts";

/**
 * The routine's days as one short row each, so a drag moves a row instead of
 * a whole day card that fills the screen.
 */
export function ReorderDaysSheet(props: {
  days: RoutineDetail["days"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const command = useCommand();
  return (
    <Sheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("routines.reorder.title")}
    >
      <SortableList
        items={props.days}
        className="dividers flex flex-col py-1"
        handleLabel={(day) => t("routines.reorder.moveDay", { name: day.name })}
        onMove={(dayId, toIndex) => command("moveDay", { dayId, toIndex })}
        render={(day, dayIndex, handle) => (
          <div className="flex items-center gap-1 py-1 pr-2 pl-4">
            <span
              aria-hidden
              className={`size-2.5 shrink-0 rounded-full ${dayDotClass(dayIndex)}`}
            />
            <span className="tabular w-5 shrink-0 pl-1 text-sm text-ink-muted">
              {dayIndex + 1}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{day.name}</span>
              <span className="truncate text-sm text-ink-muted">
                {t("routines.reorder.exercises", { count: day.slots.length })}
              </span>
            </span>
            <GripHandle handle={handle} />
          </div>
        )}
      />
    </Sheet>
  );
}
