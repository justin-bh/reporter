import type { ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@reporter/ui';

/**
 * A controlled, presentational editor for an ordered list of items. Each row has
 * a drag handle (reorder via pointer or keyboard), the caller's fields, and a
 * remove button; an "add" button appends `newItem()`. Generic over the item type
 * so it composes the report-content editors (scope targets, recommendations,
 * contacts, software, diagrams, …) without forking the dnd-kit wiring each time.
 *
 * Ordering is index-based: `SortableContext` uses each row's index as its id, so
 * items don't need a stable key of their own.
 */
export interface RepeatableListProps<T> {
  items: T[];
  onChange: (next: T[]) => void;
  /** Render the row body. `update` replaces this row's item; `index` is 0-based. */
  renderRow: (item: T, update: (next: T) => void, index: number) => ReactNode;
  /** Factory for a fresh item when the add button is pressed. */
  newItem: () => T;
  addLabel: string;
  /** Message shown in place of the list when there are no items yet. */
  emptyHint?: ReactNode;
  disabled?: boolean;
  /** Passed to disabled controls as a tooltip (e.g. the read-only reason). */
  disabledTitle?: string;
}

export function RepeatableList<T>({
  items,
  onChange,
  renderRow,
  newItem,
  addLabel,
  emptyHint,
  disabled = false,
  disabledTitle,
}: RepeatableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function updateAt(index: number, next: T) {
    onChange(items.map((it, i) => (i === index ? next : it)));
  }

  function removeAt(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...items, newItem()]);
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = Number(active.id);
    const to = Number(over.id);
    if (Number.isNaN(from) || Number.isNaN(to)) return;
    onChange(arrayMove(items, from, to));
  }

  // Row ids are the string form of each index; stable within a render pass.
  const ids = items.map((_, i) => String(i));

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        emptyHint ? (
          <p className="text-xs text-muted">{emptyHint}</p>
        ) : null
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2">
              {items.map((item, i) => (
                <SortableRow
                  key={i}
                  id={String(i)}
                  index={i}
                  disabled={disabled}
                  disabledTitle={disabledTitle}
                  onRemove={() => removeAt(i)}
                >
                  {renderRow(item, (next) => updateAt(i, next), i)}
                </SortableRow>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={add}
        disabled={disabled}
        title={disabled ? disabledTitle : undefined}
      >
        ＋ {addLabel}
      </Button>
    </div>
  );
}

function SortableRow({
  id,
  index,
  disabled,
  disabledTitle,
  onRemove,
  children,
}: {
  id: string;
  index: number;
  disabled: boolean;
  disabledTitle?: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 rounded-card border border-border bg-surface p-3"
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        disabled={disabled}
        title={disabled ? disabledTitle : undefined}
        aria-label={`Drag to reorder item ${index + 1}`}
        className="mt-1 cursor-grab touch-none px-1 text-muted hover:text-text active:cursor-grabbing disabled:opacity-50"
      >
        ⠿
      </button>
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        title={disabled ? disabledTitle : undefined}
        aria-label={`Remove item ${index + 1}`}
        className="mt-1 px-1 text-muted hover:text-danger disabled:opacity-50"
      >
        ✕
      </button>
    </li>
  );
}
