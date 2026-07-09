import type { DragEndEvent } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type React from 'react';

/**
 * Resolve a drag's active/over ids to from/to indices within an ordered id
 * list. Returns null when the ids match or either is missing.
 */
export function getDragReorderIndices(
  orderedIds: string[],
  activeId: string,
  overId: string
): { from: number; to: number } | null {
  if (activeId === overId) {
    return null;
  }
  const from = orderedIds.indexOf(activeId);
  const to = orderedIds.indexOf(overId);
  if (from === -1 || to === -1) {
    return null;
  }
  return { from, to };
}

/**
 * Resolve a dnd-kit drag-end event to from/to indices. Returns null when the
 * item was dropped outside any target (no `over`).
 */
export function getDragEndReorder(
  event: DragEndEvent,
  orderedIds: string[]
): { from: number; to: number } | null {
  const { active, over } = event;
  if (!over) {
    return null;
  }
  return getDragReorderIndices(orderedIds, String(active.id), String(over.id));
}

/**
 * Resolve a drag over a filtered (visible) list back to from/to indices in the
 * full ordered list, so reordering stays correct when completed rows are hidden.
 * Returns null when the drop has no valid target.
 */
export function getFilteredReorder(
  event: DragEndEvent,
  fullIds: string[],
  visibleIds: string[]
): { from: number; to: number } | null {
  const indices = getDragEndReorder(event, visibleIds);
  if (!indices) {
    return null;
  }
  const from = fullIds.indexOf(visibleIds[indices.from]);
  const to = fullIds.indexOf(visibleIds[indices.to]);
  if (from === -1 || to === -1) {
    return null;
  }
  return { from, to };
}

interface SortableTaskItemProps {
  id: string;
  children: React.ReactNode;
  /** Drag handle only appears while the row is being edited (matches the design) */
  showHandle?: boolean;
}

/**
 * Wraps a task row with a drag handle and dnd-kit sortable behavior.
 * The handle carries the drag listeners so the rest of the row stays clickable,
 * and is only rendered in edit mode so resting rows stay clean.
 */
export const SortableTaskItem: React.FC<SortableTaskItemProps> = ({
  id,
  children,
  showHandle = false,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-1">
      {showHandle && (
        <button
          type="button"
          className="mt-2.5 flex-shrink-0 cursor-grab touch-none text-tertiary hover:text-secondary transition-colors"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
};
