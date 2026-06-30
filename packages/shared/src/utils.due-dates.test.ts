import { describe, expect, it } from 'vitest';
import type { Goal } from './types';
import {
  getDateStringDaysAgo,
  getDueDateLabel,
  getNextDayDateString,
  getRecentIncompleteTasks,
  getTodayDateString,
  getUpcomingTasks,
  getYesterdayDateString,
  shouldShowReviewPrompt,
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

  describe('shouldShowReviewPrompt', () => {
    const base = {
      streakCurrent: 0,
      completedPomodoros: 0,
      hasSeenOnboarding: true,
      state: { dismissed: false, count: 0, lastShownAt: null as string | null },
      today: '2026-06-11',
    };

    it('shows once a delight milestone is reached (7-day streak)', () => {
      expect(shouldShowReviewPrompt({ ...base, streakCurrent: 7 })).toBe(true);
    });

    it('shows once 10 pomodoros are completed', () => {
      expect(shouldShowReviewPrompt({ ...base, completedPomodoros: 10 })).toBe(true);
    });

    it('does not show below either threshold', () => {
      expect(shouldShowReviewPrompt({ ...base, streakCurrent: 6, completedPomodoros: 9 })).toBe(
        false
      );
    });

    it('does not show before onboarding is complete', () => {
      expect(shouldShowReviewPrompt({ ...base, streakCurrent: 7, hasSeenOnboarding: false })).toBe(
        false
      );
    });

    it('does not show once permanently dismissed', () => {
      expect(
        shouldShowReviewPrompt({
          ...base,
          streakCurrent: 7,
          state: { ...base.state, dismissed: true },
        })
      ).toBe(false);
    });

    it('does not show after it has been shown twice', () => {
      expect(
        shouldShowReviewPrompt({
          ...base,
          streakCurrent: 7,
          state: { dismissed: false, count: 2, lastShownAt: '2026-06-01' },
        })
      ).toBe(false);
    });

    it('spaces the second ask at least 7 days after the first', () => {
      const seen = { dismissed: false, count: 1 };
      // 6 days later — too soon
      expect(
        shouldShowReviewPrompt({
          ...base,
          streakCurrent: 7,
          state: { ...seen, lastShownAt: '2026-06-05' },
        })
      ).toBe(false);
      // 7 days later — eligible again
      expect(
        shouldShowReviewPrompt({
          ...base,
          streakCurrent: 7,
          state: { ...seen, lastShownAt: '2026-06-04' },
        })
      ).toBe(true);
    });

    it('shows on the first eligible milestone (count 0, no lastShownAt)', () => {
      expect(shouldShowReviewPrompt({ ...base, completedPomodoros: 10 })).toBe(true);
    });

    it('shows when both signals are met', () => {
      expect(shouldShowReviewPrompt({ ...base, streakCurrent: 7, completedPomodoros: 10 })).toBe(
        true
      );
    });

    it('stays hidden when a prior show has no/invalid lastShownAt', () => {
      const seen = { dismissed: false, count: 1 };
      expect(
        shouldShowReviewPrompt({ ...base, streakCurrent: 7, state: { ...seen, lastShownAt: null } })
      ).toBe(false);
      expect(
        shouldShowReviewPrompt({
          ...base,
          streakCurrent: 7,
          state: { ...seen, lastShownAt: 'not-a-date' },
        })
      ).toBe(false);
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

  // Guards the UTC->local fix: must stay consistent with the sibling local-time helpers,
  // not drift back to toISOString() (which is off by a day in some timezones near midnight).
  describe('getDateStringDaysAgo', () => {
    it('returns today for 0 days ago', () => {
      expect(getDateStringDaysAgo(0)).toBe(getTodayDateString());
    });

    it('returns yesterday for 1 day ago', () => {
      expect(getDateStringDaysAgo(1)).toBe(getYesterdayDateString());
    });

    it('returns a YYYY-MM-DD string exactly N days before today', () => {
      const result = getDateStringDaysAgo(7);

      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const daysApart = (Date.parse(getTodayDateString()) - Date.parse(result)) / 86_400_000;
      expect(daysApart).toBe(7);
    });
  });
});
