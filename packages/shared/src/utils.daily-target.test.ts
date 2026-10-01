import { describe, expect, it } from 'vitest';
import { baseReminder } from './__fixtures__/reminders.fixtures';
import { DEFAULT_REMINDER_ACTIVE_HOURS, REMINDER_TEMPLATES } from './constants';
import type { Reminder, ReminderActiveHours } from './types';
import {
  buildReminderRecurring,
  doneCountToday,
  nextReminderDueDate,
  recordReminderDone,
  resolveReminderNotificationAction,
  skipReminderOccurrence,
} from './utils';

const WORKDAY: ReminderActiveHours = { start: '09:00', end: '18:00' };

/** Local time on Monday 5 October 2026, or a later day that week. */
function at(hours: number, minutes = 0, day = 5): Date {
  return new Date(2026, 9, day, hours, minutes, 0, 0);
}

function water(doneToday?: Reminder['doneToday']): Reminder {
  return baseReminder({
    dueDate: at(14).toISOString(),
    recurring: { frequency: 'interval', intervalMinutes: 60, activeHours: WORKDAY, dailyTarget: 3 },
    doneToday,
  });
}

describe('doneCountToday', () => {
  it('counts what was marked done today', () => {
    expect(doneCountToday(water({ date: '2026-10-05', count: 2 }), at(14))).toBe(2);
  });

  it('starts again from zero on a new day', () => {
    expect(doneCountToday(water({ date: '2026-10-04', count: 2 }), at(14))).toBe(0);
  });

  it('is zero before anything was marked done', () => {
    expect(doneCountToday(water(), at(14))).toBe(0);
  });
});

describe('recordReminderDone', () => {
  it('adds one to today’s count', () => {
    expect(recordReminderDone(water({ date: '2026-10-05', count: 1 }), at(14)).doneToday).toEqual({
      date: '2026-10-05',
      count: 2,
    });
  });

  it('starts today’s count over a stale day', () => {
    expect(recordReminderDone(water({ date: '2026-10-04', count: 3 }), at(14)).doneToday).toEqual({
      date: '2026-10-05',
      count: 1,
    });
  });

  it('leaves a reminder without a daily target uncounted', () => {
    const plain = baseReminder({ recurring: { frequency: 'interval', intervalMinutes: 60 } });

    expect(recordReminderDone(plain, at(14)).doneToday).toBeUndefined();
  });
});

describe('nextReminderDueDate with a daily target', () => {
  it('keeps nudging until the target is met', () => {
    expect(nextReminderDueDate(water({ date: '2026-10-05', count: 2 }), at(14))).toEqual(at(15));
  });

  it('stays quiet until the next day’s window once the target is met', () => {
    expect(nextReminderDueDate(water({ date: '2026-10-05', count: 3 }), at(14))).toEqual(
      at(9, 0, 6)
    );
  });

  it('nudges again once yesterday’s met target is behind it', () => {
    expect(nextReminderDueDate(water({ date: '2026-10-04', count: 3 }), at(10, 0, 5))).toEqual(
      at(11, 0, 5)
    );
  });
});

describe('skipReminderOccurrence with a daily target', () => {
  it('stays quiet until the next day’s window once an early skip meets the target', () => {
    expect(skipReminderOccurrence(water({ date: '2026-10-05', count: 3 }), at(14))).toEqual(
      at(9, 0, 6)
    );
  });
});

describe('a met target on a window that crosses midnight', () => {
  it('waits for the next evening’s opening, not the small hours of the same window', () => {
    const lateNight = baseReminder({
      dueDate: at(23).toISOString(),
      recurring: {
        frequency: 'interval',
        intervalMinutes: 60,
        activeHours: { start: '22:00', end: '02:00' },
        dailyTarget: 1,
      },
      doneToday: { date: '2026-10-05', count: 1 },
    });

    expect(nextReminderDueDate(lateNight, at(23))).toEqual(at(22, 0, 6));
  });
});

describe('the Drink Water template', () => {
  it('aims for eight a day', () => {
    expect(REMINDER_TEMPLATES.find((t) => t.id === 'water')?.dailyTarget).toBe(8);
  });
});

describe('buildReminderRecurring with a daily target', () => {
  it('carries the target on an interval cadence', () => {
    expect(buildReminderRecurring(true, 'interval', 60, DEFAULT_REMINDER_ACTIVE_HOURS, 8)).toEqual({
      frequency: 'interval',
      intervalMinutes: 60,
      activeHours: DEFAULT_REMINDER_ACTIVE_HOURS,
      dailyTarget: 8,
    });
  });
});

describe('resolveReminderNotificationAction with a daily target', () => {
  it('counts a Done on a reminder with a daily target', () => {
    expect(resolveReminderNotificationAction(water(), 0, at(14))).toEqual({ type: 'count' });
  });

  it('only dismisses a Done on a paused reminder, whatever its target', () => {
    expect(resolveReminderNotificationAction({ ...water(), paused: true }, 0, at(14))).toEqual({
      type: 'dismiss',
    });
  });

  it('still only dismisses a Done on a recurring reminder without a target', () => {
    const plain = baseReminder({ recurring: { frequency: 'interval', intervalMinutes: 60 } });

    expect(resolveReminderNotificationAction(plain, 0, at(14))).toEqual({ type: 'dismiss' });
  });
});
