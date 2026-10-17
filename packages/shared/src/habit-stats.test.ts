import { describe, expect, it } from 'vitest';
import { HABIT_HISTORY_RETENTION_DAYS, habitDayId, recordHabitDay } from './habit-stats';
import type { HabitDay } from './types';

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
