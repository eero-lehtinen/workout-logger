import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { clsx } from "clsx";
import { GripVertical } from "lucide-react";
import { type ReactNode, useState } from "react";

/** Props for the element that starts a drag. */
export interface DragHandle {
  label: string;
  props: Record<string, unknown>;
}

/**
 * A list reordered by dragging each item's handle; the rest of the item
 * stays tappable and scrollable. The new order shows at once and stays
 * until `items` changes, so the list doesn't snap back while the write
 * goes through the worker.
 */
export function SortableList<T extends { id: string }>(props: {
  items: readonly T[];
  /** Called with the moved item and its new index. */
  onMove: (id: string, toIndex: number) => void;
  render: (item: T, index: number, handle: DragHandle) => ReactNode;
  /** The accessible name of an item's handle. */
  handleLabel: (item: T) => string;
  /** `grid` for items laid out in columns. */
  layout?: "list" | "grid";
  className?: string;
  as?: "ol" | "ul";
}) {
  const sensors = useSensors(
    // A small distance keeps taps on the handle from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const [local, setLocal] = useState<{ source: readonly T[]; order: T[] }>();
  const items = local?.source === props.items ? local.order : props.items;

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from === -1 || to === -1) return;
    setLocal({ source: props.items, order: arrayMove([...items], from, to) });
    props.onMove(String(active.id), to);
  }

  const List = props.as ?? "ol";
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={
          props.layout === "grid"
            ? rectSortingStrategy
            : verticalListSortingStrategy
        }
      >
        <List className={props.className}>
          {items.map((item, index) => (
            <SortableItem
              key={item.id}
              id={item.id}
              handleLabel={props.handleLabel(item)}
            >
              {(handle) => props.render(item, index, handle)}
            </SortableItem>
          ))}
        </List>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem(props: {
  id: string;
  handleLabel: string;
  children: (handle: DragHandle) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.id });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={clsx("relative", isDragging && "z-10 opacity-90 shadow-lg")}
    >
      {props.children({
        label: props.handleLabel,
        props: { ref: setActivatorNodeRef, ...attributes, ...listeners },
      })}
    </li>
  );
}

/** The grip that starts a drag; also focusable for keyboard reordering. */
export function GripHandle({ handle }: { handle: DragHandle }) {
  return (
    <button
      type="button"
      aria-label={handle.label}
      title={handle.label}
      {...handle.props}
      className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink active:cursor-grabbing"
    >
      <GripVertical size={18} />
    </button>
  );
}
