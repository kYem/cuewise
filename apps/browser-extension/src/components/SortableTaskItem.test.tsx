import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getDragEndReorder, getDragReorderIndices, SortableTaskItem } from './SortableTaskItem';

function dragEnd(activeId: string, overId: string | null): DragEndEvent {
  return {
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  } as DragEndEvent;
}

describe('getDragReorderIndices', () => {
  it('maps active and over ids to their indices', () => {
    expect(getDragReorderIndices(['a', 'b', 'c'], 'a', 'c')).toEqual({ from: 0, to: 2 });
    expect(getDragReorderIndices(['a', 'b', 'c'], 'c', 'b')).toEqual({ from: 2, to: 1 });
  });

  it('returns null when the active and over ids are the same', () => {
    expect(getDragReorderIndices(['a', 'b', 'c'], 'b', 'b')).toBeNull();
  });

  it('returns null when an id is not in the list', () => {
    expect(getDragReorderIndices(['a', 'b', 'c'], 'a', 'z')).toBeNull();
    expect(getDragReorderIndices(['a', 'b', 'c'], 'z', 'a')).toBeNull();
  });
});

describe('getDragEndReorder', () => {
  it('returns null when the item is dropped outside any target (no over)', () => {
    expect(getDragEndReorder(dragEnd('a', null), ['a', 'b', 'c'])).toBeNull();
  });

  it('maps a drag-end event to from/to indices in list order', () => {
    expect(getDragEndReorder(dragEnd('a', 'c'), ['a', 'b', 'c'])).toEqual({ from: 0, to: 2 });
    expect(getDragEndReorder(dragEnd('c', 'b'), ['a', 'b', 'c'])).toEqual({ from: 2, to: 1 });
  });

  it('returns null when dropped on itself (active === over)', () => {
    expect(getDragEndReorder(dragEnd('b', 'b'), ['a', 'b', 'c'])).toBeNull();
  });
});

describe('SortableTaskItem', () => {
  it('renders a drag handle alongside its children', () => {
    render(
      <DndContext>
        <SortableContext items={['task-1']}>
          <SortableTaskItem id="task-1">
            <span>Task body</span>
          </SortableTaskItem>
        </SortableContext>
      </DndContext>
    );

    expect(screen.getByRole('button', { name: 'Drag to reorder' })).toBeInTheDocument();
    expect(screen.getByText('Task body')).toBeInTheDocument();
  });
});
