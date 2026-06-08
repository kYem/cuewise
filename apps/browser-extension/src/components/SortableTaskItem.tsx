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

interface SortableTaskItemProps {
  id: string;
  children: React.ReactNode;
}

/**
 * Wraps a task row with a drag handle and dnd-kit sortable behavior.
 * The handle carries the drag listeners so the rest of the row stays clickable.
 */
export const SortableTaskItem: React.FC<SortableTaskItemProps> = ({ id, children }) => {
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
      <button
        type="button"
        className="mt-3 flex-shrink-0 cursor-grab touch-none text-tertiary hover:text-secondary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
};
