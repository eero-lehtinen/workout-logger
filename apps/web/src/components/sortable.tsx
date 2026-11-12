import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  type Modifier,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { clsx } from "clsx";
import { GripVertical } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/** Rows of a list only move up and down. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/**
 * Auto-scroll near the edges only vertically: horizontal auto-scroll chased
 * the dragged item and kept widening the screen.
 */
const AUTO_SCROLL = { threshold: { x: 0, y: 0.2 } };

const KEYBOARD_MOVES = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

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
  const listRef = useRef<HTMLOListElement & HTMLUListElement>(null);
  const [keyboardDrag, setKeyboardDrag] = useState(false);

  // dnd-kit's keyboard sensor listens on the document, and Base UI's dialog
  // popup stops arrow keys from propagating, so inside a sheet a keyboard drag
  // never moves. During one, arrows go to the document directly.
  useEffect(() => {
    const list = listRef.current;
    if (!keyboardDrag || !list) return;
    const forward = (e: KeyboardEvent) => {
      if (!KEYBOARD_MOVES.has(e.code)) return;
      e.preventDefault();
      e.stopPropagation();
      list.ownerDocument.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: e.key,
          code: e.code,
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    list.addEventListener("keydown", forward);
    return () => list.removeEventListener("keydown", forward);
  }, [keyboardDrag]);

  function onDragStart({ activatorEvent }: DragStartEvent) {
    setKeyboardDrag(activatorEvent instanceof KeyboardEvent);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setKeyboardDrag(false);
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
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setKeyboardDrag(false)}
      autoScroll={AUTO_SCROLL}
      modifiers={[verticalOnly]}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <List ref={listRef} className={props.className}>
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
      className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-ink-muted hover:bg-surface hover:text-ink active:cursor-grabbing"
    >
      <GripVertical size={18} />
    </button>
  );
}
