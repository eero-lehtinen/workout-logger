import { ArrowLeftRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, dangerAlignClass } from "../../components/button.tsx";
import { FieldLabel } from "../../components/headings.tsx";
import { Sheet } from "../../components/sheet.tsx";
import { useCommand } from "../../db/react.tsx";
import { Alternatives } from "./alternatives.tsx";
import { type Slot, SlotDetails } from "./slot-details.tsx";

/** Everything about one slot, opened from its row in the day. */
export function SlotSheet(props: {
  slot: Slot | null;
  defaultRestS: number;
  onClose: () => void;
  onChangeExercise: (slotId: string) => void;
  onAddAlternative: (slotId: string) => void;
}) {
  const { slot } = props;
  const { t } = useTranslation();
  const command = useCommand();
  const name = slot?.exerciseName ?? t("routines.slot.deletedExercise");
  return (
    <Sheet
      open={slot !== null}
      onOpenChange={(open) => !open && props.onClose()}
      title={name}
    >
      {slot && (
        <div className="flex flex-col gap-5 px-4 pt-4 pb-6">
          <Button
            className="self-start"
            onClick={() => props.onChangeExercise(slot.id)}
          >
            <ArrowLeftRight size={16} />
            {t("routines.slot.changeExercise")}
          </Button>
          <div className="flex flex-col gap-1.5">
            <FieldLabel as="h3">{t("routines.slot.alternatives")}</FieldLabel>
            <Alternatives
              slot={slot}
              onAdd={() => props.onAddAlternative(slot.id)}
            />
          </div>
          <SlotDetails slot={slot} defaultRestS={props.defaultRestS} />
          <Button
            variant="danger"
            className={`self-start ${dangerAlignClass}`}
            onClick={() => {
              props.onClose();
              void command(
                "deleteSlot",
                { slotId: slot.id },
                {
                  undoLabel: t("routines.slot.removedUndo", {
                    name:
                      slot.exerciseName ?? t("routines.slot.exerciseFallback"),
                  }),
                },
              );
            }}
          >
            {t("routines.slot.removeFromDay")}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
