import { describe, expect, it } from 'vitest';
import { baseReminder } from './__fixtures__/reminders.fixtures';
import {
  getHabitStats,
  HABIT_HISTORY_RETENTION_DAYS,
  habitDayId,
  habitHistorySweepCutoff,
  recordHabitDay,
} from './habit-stats';
import type { HabitDay, Reminder } from './types';

function day(reminderId: string, date: string, count: number): HabitDay {
  return { id: habitDayId(reminderId, date), reminderId, date, count };
}

describe('recordHabitDay', () => {
  it('starts a day at one', () => {
    const { next, changedId, prunedIds } = recordHabitDay([], 'r1', '2026-10-05');

    expect(next).toEqual([day('r1', '2026-10-05', 1)]);
    expect(changedId).toBe('r1:2026-10-05');
    expect(prunedIds).toEqual([]);
  });

  it('adds one to a day already recorded', () => {
    const { next } = recordHabitDay([day('r1', '2026-10-05', 2)], 'r1', '2026-10-05');

    expect(next).toEqual([day('r1', '2026-10-05', 3)]);
  });

  it('prunes that habit’s days older than the retention window, and only that habit’s', () => {
    const old = day('r1', '2025-10-05', 1);
    const edge = day('r1', '2025-10-06', 1);
    const otherHabit = day('r2', '2025-01-01', 1);

    const { next, prunedIds } = recordHabitDay([old, edge, otherHabit], 'r1', '2026-10-05');

    expect(HABIT_HISTORY_RETENTION_DAYS).toBe(365);
    expect(prunedIds).toEqual([old.id]);
    expect(next.map((d) => d.id)).toEqual([edge.id, otherHabit.id, 'r1:2026-10-05']);
  });
});

describe('habitHistorySweepCutoff', () => {
  it('keeps the oldest day of a window that opened yesterday', () => {
    const { prunedIds } = recordHabitDay([day('r1', '2025-10-05', 1)], 'r1', '2026-10-04');

    expect(prunedIds).toEqual([]);
    expect(habitHistorySweepCutoff(at(2))).toBe('2025-10-05');
  });
});

/** Local time on Monday 5 October 2026, or `day` of that month. */
function at(hours: number, dayOfMonth = 5): Date {
  return new Date(2026, 9, dayOfMonth, hours, 0, 0, 0);
}

function date(dayOfMonth: number): string {
  return `2026-10-${String(dayOfMonth).padStart(2, '0')}`;
}

function habit(recurring: Partial<Extract<Reminder['recurring'], { frequency: 'interval' }>> = {}) {
  return baseReminder({
    recurring: { frequency: 'interval', intervalMinutes: 60, ...recurring },
  });
}

function ticks(...entries: [number, number][]): HabitDay[] {
  return entries.map(([dayOfMonth, count]) => day('r1', date(dayOfMonth), count));
}

describe('getHabitStats', () => {
  it('counts consecutive kept days back from today', () => {
    const stats = getHabitStats(habit(), ticks([3, 1], [4, 1], [5, 1]), at(20));

    expect(stats.current).toBe(3);
  });

  it('does not break the streak on today before it is kept', () => {
    const stats = getHabitStats(habit(), ticks([3, 1], [4, 1]), at(9));

    expect(stats.current).toBe(2);
    expect(stats.last30.at(-1)?.state).toBe('pending');
  });

  it('keeps a partial today pending rather than breaking the streak', () => {
    const stats = getHabitStats(habit({ dailyTarget: 3 }), ticks([4, 3], [5, 1]), at(20));

    expect(stats.current).toBe(1);
    expect(stats.last30.at(-1)).toEqual({ date: date(5), state: 'pending', count: 1 });
  });

  it('breaks the streak on a partial day and draws it as partial', () => {
    const stats = getHabitStats(habit({ dailyTarget: 3 }), ticks([3, 3], [4, 1], [5, 3]), at(20));

    expect(stats.current).toBe(1);
    expect(stats.last30.at(-2)?.state).toBe('partial');
  });

  it('skips off days and counts a ticked off day as kept', () => {
    const weekdays = { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] };
    const fridayAndSunday = ticks([2, 1], [4, 1], [5, 1]);

    const stats = getHabitStats(habit({ activeHours: weekdays }), fridayAndSunday, at(20));

    expect(stats.current).toBe(3);
    expect(stats.last30.at(-3)?.state).toBe('off');
  });

  it('keeps a midnight-crossing window’s small hours on the evening before', () => {
    const lateWindow = { start: '22:00', end: '02:00' };

    const stats = getHabitStats(habit({ activeHours: lateWindow }), ticks([4, 1]), at(1, 5));

    expect(stats.last30.at(-1)).toEqual({ date: date(4), state: 'kept', count: 1 });
  });

  it('answers the best streak inside the window, never below the current one', () => {
    const stats = getHabitStats(habit(), ticks([1, 1], [2, 1], [3, 1], [5, 1]), at(20));

    expect(stats.best).toBe(3);
    expect(stats.current).toBe(1);
  });

  it('counts only the retention window’s days toward the best streak', () => {
    const straddlingTheEdge = ['2025-10-03', '2025-10-04', '2025-10-05', '2025-10-06'];

    const stats = getHabitStats(
      habit(),
      straddlingTheEdge.map((d) => day('r1', d, 1)),
      at(20)
    );

    expect(stats.best).toBe(1);
  });

  it('rates the last 30 days from the first recorded day only', () => {
    const stats = getHabitStats(habit(), ticks([3, 1], [5, 1]), at(20));

    expect(stats.rate30).toBe(67);
  });

  it('treats the days before the first record as off, not missed', () => {
    const stats = getHabitStats(habit(), ticks([4, 1], [5, 1]), at(20));

    expect(stats).toMatchObject({ current: 2, best: 2, rate30: 100 });
    expect(stats.last30.slice(0, -2).every((cell) => cell.state === 'off')).toBe(true);
  });

  it('draws a habit with no record as off days and a pending today, with no rate', () => {
    const stats = getHabitStats(habit(), [], at(20));

    expect(stats).toMatchObject({ current: 0, best: 0, rate30: null });
    expect(stats.last30).toHaveLength(30);
    expect(stats.last30.at(-1)?.state).toBe('pending');
    expect(stats.last30.slice(0, -1).every((cell) => cell.state === 'off')).toBe(true);
  });

  it('ignores other habits’ days', () => {
    const stats = getHabitStats(habit(), [day('r2', date(5), 4)], at(20));

    expect(stats.current).toBe(0);
  });
});
