import { describe, expect, it } from 'vitest';
import type { Goal } from './types';
import {
  addSubtaskToGoal,
  calculateStreak,
  duplicateGoal,
  getSubtaskProgress,
  getTodayDateString,
  removeSubtaskFromGoal,
  reorderGoals,
  toggleSubtaskInGoal,
} from './utils';

function createTestTask(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'task-1',
    text: 'Test task',
    completed: false,
    createdAt: new Date().toISOString(),
    date: getTodayDateString(),
    type: 'task',
    ...overrides,
  };
}

describe('Subtask Utilities', () => {
  describe('addSubtaskToGoal', () => {
    it('should add a subtask to a goal with no subtasks', () => {
      const goal = createTestTask();
      const result = addSubtaskToGoal(goal, 'New subtask');

      expect(result.subtasks).toHaveLength(1);
      expect(result.subtasks?.[0].text).toBe('New subtask');
      expect(result.subtasks?.[0].completed).toBe(false);
      expect(result.subtasks?.[0].id).toBeTruthy();
    });

    it('should append a subtask to existing subtasks', () => {
      const goal = createTestTask({
        subtasks: [{ id: 'sub-1', text: 'Existing', completed: true }],
      });
      const result = addSubtaskToGoal(goal, 'Second subtask');

      expect(result.subtasks).toHaveLength(2);
      expect(result.subtasks?.[0].text).toBe('Existing');
      expect(result.subtasks?.[1].text).toBe('Second subtask');
    });

    it('should not mutate the original goal', () => {
      const goal = createTestTask();
      addSubtaskToGoal(goal, 'New subtask');

      expect(goal.subtasks).toBeUndefined();
    });
  });

  describe('toggleSubtaskInGoal', () => {
    it('should toggle a subtask from incomplete to complete', () => {
      const goal = createTestTask({
        subtasks: [{ id: 'sub-1', text: 'Task', completed: false }],
      });
      const result = toggleSubtaskInGoal(goal, 'sub-1');

      expect(result.subtasks?.[0].completed).toBe(true);
    });

    it('should toggle a subtask from complete to incomplete', () => {
      const goal = createTestTask({
        subtasks: [{ id: 'sub-1', text: 'Task', completed: true }],
      });
      const result = toggleSubtaskInGoal(goal, 'sub-1');

      expect(result.subtasks?.[0].completed).toBe(false);
    });

    it('should not affect other subtasks', () => {
      const goal = createTestTask({
        subtasks: [
          { id: 'sub-1', text: 'First', completed: false },
          { id: 'sub-2', text: 'Second', completed: true },
        ],
      });
      const result = toggleSubtaskInGoal(goal, 'sub-1');

      expect(result.subtasks?.[0].completed).toBe(true);
      expect(result.subtasks?.[1].completed).toBe(true);
    });

    it('should handle non-existent subtask ID gracefully', () => {
      const goal = createTestTask({
        subtasks: [{ id: 'sub-1', text: 'Task', completed: false }],
      });
      const result = toggleSubtaskInGoal(goal, 'non-existent');

      expect(result.subtasks?.[0].completed).toBe(false);
    });

    it('completes the parent goal when the last incomplete subtask is checked', () => {
      const goal = createTestTask({
        completed: false,
        subtasks: [
          { id: 'sub-1', text: 'First', completed: true },
          { id: 'sub-2', text: 'Second', completed: false },
        ],
      });
      const result = toggleSubtaskInGoal(goal, 'sub-2');

      expect(result.subtasks?.every((s) => s.completed)).toBe(true);
      expect(result.completed).toBe(true);
    });

    it('reopens a completed parent goal when a subtask is unchecked', () => {
      const goal = createTestTask({
        completed: true,
        subtasks: [
          { id: 'sub-1', text: 'First', completed: true },
          { id: 'sub-2', text: 'Second', completed: true },
        ],
      });
      const result = toggleSubtaskInGoal(goal, 'sub-2');

      expect(result.completed).toBe(false);
    });
  });

  describe('removeSubtaskFromGoal', () => {
    it('should remove a subtask by ID', () => {
      const goal = createTestTask({
        subtasks: [
          { id: 'sub-1', text: 'First', completed: false },
          { id: 'sub-2', text: 'Second', completed: true },
        ],
      });
      const result = removeSubtaskFromGoal(goal, 'sub-1');

      expect(result.subtasks).toHaveLength(1);
      expect(result.subtasks?.[0].id).toBe('sub-2');
    });

    it('should return empty subtasks array when removing the last subtask', () => {
      const goal = createTestTask({
        subtasks: [{ id: 'sub-1', text: 'Only', completed: false }],
      });
      const result = removeSubtaskFromGoal(goal, 'sub-1');

      expect(result.subtasks).toHaveLength(0);
    });
  });

  describe('getSubtaskProgress', () => {
    it('should return zero counts for a goal with no subtasks', () => {
      const goal = createTestTask();
      const progress = getSubtaskProgress(goal);

      expect(progress).toEqual({ completed: 0, total: 0 });
    });

    it('should count completed and total subtasks', () => {
      const goal = createTestTask({
        subtasks: [
          { id: 'sub-1', text: 'Done', completed: true },
          { id: 'sub-2', text: 'Not done', completed: false },
          { id: 'sub-3', text: 'Also done', completed: true },
        ],
      });
      const progress = getSubtaskProgress(goal);

      expect(progress).toEqual({ completed: 2, total: 3 });
    });
  });
});

describe('duplicateGoal', () => {
  it('should create a copy with a new ID', () => {
    const goal = createTestTask({ text: 'Original task' });
    const copy = duplicateGoal(goal);

    expect(copy.id).not.toBe(goal.id);
    expect(copy.text).toBe('Original task');
  });

  it('should reset completed and transferCount', () => {
    const goal = createTestTask({ completed: true, transferCount: 3 });
    const copy = duplicateGoal(goal);

    expect(copy.completed).toBe(false);
    expect(copy.transferCount).toBe(0);
  });

  it('should deep-copy subtasks with new IDs and reset completion', () => {
    const goal = createTestTask({
      subtasks: [
        { id: 'sub-1', text: 'Subtask A', completed: true },
        { id: 'sub-2', text: 'Subtask B', completed: false },
      ],
    });
    const copy = duplicateGoal(goal);

    expect(copy.subtasks).toHaveLength(2);
    expect(copy.subtasks?.[0].id).not.toBe('sub-1');
    expect(copy.subtasks?.[0].text).toBe('Subtask A');
    expect(copy.subtasks?.[0].completed).toBe(false);
    expect(copy.subtasks?.[1].text).toBe('Subtask B');
    expect(copy.subtasks?.[1].completed).toBe(false);
  });

  it('should preserve dueDate and parentId', () => {
    const goal = createTestTask({ dueDate: '2026-04-15', parentId: 'obj-1' });
    const copy = duplicateGoal(goal);

    expect(copy.dueDate).toBe('2026-04-15');
    expect(copy.parentId).toBe('obj-1');
  });
});

describe('reorderGoals', () => {
  it('should move a goal from one position to another', () => {
    const goals = [
      createTestTask({ id: 'a', text: 'A' }),
      createTestTask({ id: 'b', text: 'B' }),
      createTestTask({ id: 'c', text: 'C' }),
    ];
    const result = reorderGoals(goals, 0, 2);

    expect(result.map((g) => g.id)).toEqual(['b', 'c', 'a']);
  });

  it('should assign correct sortOrder values', () => {
    const goals = [
      createTestTask({ id: 'a' }),
      createTestTask({ id: 'b' }),
      createTestTask({ id: 'c' }),
    ];
    const result = reorderGoals(goals, 2, 0);

    expect(result[0].sortOrder).toBe(0);
    expect(result[1].sortOrder).toBe(1);
    expect(result[2].sortOrder).toBe(2);
  });

  it('should return the same array when from and to are equal', () => {
    const goals = [createTestTask({ id: 'a' }), createTestTask({ id: 'b' })];
    const result = reorderGoals(goals, 1, 1);

    expect(result.map((g) => g.id)).toEqual(['a', 'b']);
  });

  it('should return the same array for out-of-bounds indices', () => {
    const goals = [createTestTask({ id: 'a' })];
    const result = reorderGoals(goals, -1, 5);

    expect(result).toEqual(goals);
  });
});

describe('calculateStreak', () => {
  // Local yyyy-MM-dd offset from today, matching how the app stores goal dates.
  const dayString = (offset: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  it('returns zero for no dates', () => {
    expect(calculateStreak([])).toEqual({ current: 0, longest: 0 });
  });

  it('counts consecutive days ending today, de-duplicating repeats', () => {
    const dates = [dayString(0), dayString(0), dayString(-1), dayString(-2)];
    expect(calculateStreak(dates)).toEqual({ current: 3, longest: 3 });
  });

  it('ignores future-dated entries so they cannot collapse the current streak', () => {
    // Tomorrow would otherwise sort to index 0 and break the today-anchored run.
    expect(calculateStreak([dayString(1), dayString(0), dayString(-1)]).current).toBe(2);
  });

  it('reports a current streak of zero when the run ended before today', () => {
    expect(calculateStreak([dayString(-1), dayString(-2)]).current).toBe(0);
  });
});
