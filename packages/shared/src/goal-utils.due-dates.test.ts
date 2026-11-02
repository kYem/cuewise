import { describe, expect, it } from 'vitest';
import { getNextDayDateString, getTodayDateString } from './date-utils';
import {
  getDueDateLabel,
  getRecentIncompleteTasks,
  getUpcomingTasks,
  rollDueTasksToToday,
} from './goal-utils';
import type { Goal } from './types';

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

describe('Due Date Utilities', () => {
  describe('getUpcomingTasks', () => {
    it('should return tasks with a future dueDate', () => {
      const tomorrow = getNextDayDateString();
      const goals = [
        createTestTask({ id: '1', dueDate: tomorrow }),
        createTestTask({ id: '2' }), // No dueDate
        createTestTask({ id: '3', dueDate: getTodayDateString() }), // Today, not upcoming
        createTestTask({ id: '4', type: 'objective', dueDate: tomorrow }), // Objective, not task
      ];
      const result = getUpcomingTasks(goals);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should return empty array when no tasks have future due dates', () => {
      const goals = [createTestTask({ id: '1' }), createTestTask({ id: '2' })];
      const result = getUpcomingTasks(goals);

      expect(result).toEqual([]);
    });
  });

  describe('getRecentIncompleteTasks', () => {
    const daysAgo = (n: number): string =>
      new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    it('returns incomplete tasks dated in the recent past', () => {
      const goals = [createTestTask({ id: '1', date: daysAgo(2) })];
      const result = getRecentIncompleteTasks(goals);

      expect(result.map((g) => g.id)).toEqual(['1']);
    });

    it("excludes today's tasks", () => {
      const goals = [createTestTask({ id: '1', date: getTodayDateString() })];

      expect(getRecentIncompleteTasks(goals)).toEqual([]);
    });

    it('excludes completed tasks', () => {
      const goals = [createTestTask({ id: '1', date: daysAgo(2), completed: true })];

      expect(getRecentIncompleteTasks(goals)).toEqual([]);
    });

    it('excludes tasks scheduled for a future day', () => {
      const goals = [createTestTask({ id: '1', date: getNextDayDateString() })];

      expect(getRecentIncompleteTasks(goals)).toEqual([]);
    });

    it('excludes tasks older than the day window', () => {
      const recent = createTestTask({ id: 'recent', date: daysAgo(10) });
      const old = createTestTask({ id: 'old', date: daysAgo(20) });
      const result = getRecentIncompleteTasks([recent, old]);

      expect(result.map((g) => g.id)).toEqual(['recent']);
    });

    it('respects a custom daysBack window', () => {
      const goals = [createTestTask({ id: '1', date: daysAgo(5) })];

      expect(getRecentIncompleteTasks(goals, 3)).toEqual([]);
      expect(getRecentIncompleteTasks(goals, 7).map((g) => g.id)).toEqual(['1']);
    });

    it('excludes objectives (only tasks belong in the backlog)', () => {
      const goals = [createTestTask({ id: '1', date: daysAgo(2), type: 'objective' })];

      expect(getRecentIncompleteTasks(goals)).toEqual([]);
    });
  });

  describe('getDueDateLabel', () => {
    it('should return "Today" for today', () => {
      expect(getDueDateLabel(getTodayDateString())).toBe('Today');
    });

    it('should return "Tomorrow" for tomorrow', () => {
      expect(getDueDateLabel(getNextDayDateString())).toBe('Tomorrow');
    });

    it('should return abbreviated date for far future dates', () => {
      const farFuture = '2027-06-15';
      const label = getDueDateLabel(farFuture);

      expect(label).toContain('Jun');
      expect(label).toContain('15');
    });

    it('should return day name for dates within this week (2-6 days ahead)', () => {
      // 3 days from now
      const threeDaysOut = new Date();
      threeDaysOut.setDate(threeDaysOut.getDate() + 3);
      const dateStr = threeDaysOut.toISOString().split('T')[0];
      const label = getDueDateLabel(dateStr);

      // Should be a full day name like "Monday", "Tuesday", etc.
      const dayNames = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      expect(dayNames).toContain(label);
    });

    it('should return abbreviated date for past due dates', () => {
      const pastDate = '2025-01-15';
      const label = getDueDateLabel(pastDate);

      expect(label).toContain('Jan');
      expect(label).toContain('15');
    });
  });
  describe('rollDueTasksToToday', () => {
    it('rolls incomplete tasks whose due date has arrived into today', () => {
      const goals = [
        createTestTask({ id: 'overdue', date: '2026-07-10', dueDate: '2026-07-12' }),
        createTestTask({ id: 'due-today', date: '2026-07-14', dueDate: '2026-07-15' }),
      ];

      const rolled = rollDueTasksToToday(goals, '2026-07-15');

      expect(rolled).not.toBeNull();
      expect(rolled?.rolledIds).toEqual(['overdue', 'due-today']);
      expect(rolled?.goals.every((goal) => goal.date === '2026-07-15')).toBe(true);
    });

    it('returns null when nothing is due, so callers can skip the write', () => {
      const goals = [
        createTestTask({ id: 'future', date: '2026-07-10', dueDate: '2026-07-20' }),
        createTestTask({ id: 'no-due', date: '2026-07-10' }),
      ];

      expect(rollDueTasksToToday(goals, '2026-07-15')).toBeNull();
    });

    it('skips completed tasks, objectives, and tasks already in today', () => {
      const goals = [
        createTestTask({ id: 'done', date: '2026-07-10', dueDate: '2026-07-12', completed: true }),
        createTestTask({ id: 'obj', type: 'objective', date: '2026-07-10', dueDate: '2026-07-12' }),
        createTestTask({ id: 'already', date: '2026-07-15', dueDate: '2026-07-12' }),
      ];

      expect(rollDueTasksToToday(goals, '2026-07-15')).toBeNull();
    });

    it('leaves tasks deliberately scheduled ahead alone, even when due', () => {
      // A future date is a user decision (e.g. "transfer to tomorrow") — rolling
      // it back would silently undo that choice minutes later.
      const goals = [createTestTask({ id: 'ahead', date: '2026-07-20', dueDate: '2026-07-15' })];

      expect(rollDueTasksToToday(goals, '2026-07-15')).toBeNull();
    });

    it('preserves transferCount and does not mutate its input', () => {
      const goals = [
        createTestTask({ id: 'a', date: '2026-07-10', dueDate: '2026-07-12', transferCount: 3 }),
      ];

      const rolled = rollDueTasksToToday(goals, '2026-07-15');

      expect(rolled?.goals[0]).toMatchObject({ transferCount: 3, dueDate: '2026-07-12' });
      expect(goals[0]).toMatchObject({ date: '2026-07-10' });
    });
  });
});
