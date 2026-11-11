import { Plus, X } from "lucide-react";
import { useCommand } from "../../db/react.tsx";
import type { Slot } from "./slot-details.tsx";

/** A slot's alternatives as removable chips, and a way to add one. */
export function Alternatives(props: { slot: Slot; onAdd: () => void }) {
  const command = useCommand();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {props.slot.alternatives.map((alt) => (
        <span
          key={alt.id}
          className="inline-flex h-8 items-center gap-0.5 rounded-full bg-surface pr-0.5 pl-3 text-sm"
        >
          {alt.exerciseName ?? "Deleted exercise"}
          <button
            type="button"
            aria-label={`Remove alternative ${alt.exerciseName ?? ""}`}
            onClick={() =>
              command("deleteAlternative", { alternativeId: alt.id })
            }
            className="flex size-7 items-center justify-center rounded-full hover:bg-rule"
          >
            <X size={14} />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={props.onAdd}
        className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-sm text-ink-muted hover:bg-surface hover:text-ink"
      >
        <Plus size={14} />
        Alternative
      </button>
    </div>
  );
}
