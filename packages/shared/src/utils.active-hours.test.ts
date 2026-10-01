import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseReminder } from './__fixtures__/reminders.fixtures';
import type { ReminderActiveHours } from './types';
import {
  buildReminderRecurring,
  firesPerActiveDay,
  fitToActiveHours,
  intervalDueDateFromNow,
  nextReminderDueDate,
  skipReminderOccurrence,
} from './utils';

const WORKDAY: ReminderActiveHours = { start: '09:00', end: '18:00' };
const WEEKDAYS: ReminderActiveHours = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] };
const LATE: ReminderActiveHours = { start: '22:00', end: '02:00' };

/** Local time in the week of Monday 5 October 2026 (5 = Mon … 10 = Sat, 11 = Sun). */
function at(day: number, hours: number, minutes = 0, seconds = 0): Date {
  return new Date(2026, 9, day, hours, minutes, seconds, 0);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('fitToActiveHours', () => {
  it('keeps a time inside the window', () => {
    expect(fitToActiveHours(at(5, 10), WORKDAY)).toEqual(at(5, 10));
  });

  it('keeps a time exactly at the window end', () => {
    expect(fitToActiveHours(at(5, 18), WORKDAY)).toEqual(at(5, 18));
  });

  it('moves a time before the window to that day’s start', () => {
    expect(fitToActiveHours(at(5, 7, 30), WORKDAY)).toEqual(at(5, 9));
  });

  it('moves a time after the window to the next day’s start', () => {
    expect(fitToActiveHours(at(5, 18, 30), WORKDAY)).toEqual(at(6, 9));
  });

  it('skips days the window is not active on', () => {
    expect(fitToActiveHours(at(9, 18, 30), WEEKDAYS)).toEqual(at(12, 9));
  });

  it('keeps a time after midnight inside a window that opened the evening before', () => {
    expect(fitToActiveHours(at(6, 1), LATE)).toEqual(at(6, 1));
  });

  it('moves a time past a midnight-crossing window to its next opening', () => {
    expect(fitToActiveHours(at(6, 3), LATE)).toEqual(at(6, 22));
  });

  it('counts the hours after midnight toward the day the window opened', () => {
    expect(fitToActiveHours(at(6, 1), { ...LATE, days: [1] })).toEqual(at(6, 1));
  });

  it('skips the hours after midnight of a day the window did not open on', () => {
    expect(fitToActiveHours(at(7, 1), { ...LATE, days: [1] })).toEqual(at(12, 22));
  });

  it('keeps a time just past the close when that much lateness is allowed', () => {
    expect(fitToActiveHours(at(5, 18, 0, 5), WORKDAY, 5_000)).toEqual(at(5, 18, 0, 5));
  });

  it('moves a time just past the close when no lateness is allowed', () => {
    expect(fitToActiveHours(at(5, 18, 0, 5), WORKDAY)).toEqual(at(6, 9));
  });

  it('treats a window whose end equals its start as the whole day', () => {
    const allMonday: ReminderActiveHours = { start: '09:00', end: '09:00', days: [1] };

    expect(fitToActiveHours(at(6, 8, 59), allMonday)).toEqual(at(6, 8, 59));
    expect(fitToActiveHours(at(6, 10), allMonday)).toEqual(at(12, 9));
  });

  it('treats an empty day list as every day', () => {
    expect(fitToActiveHours(at(10, 18, 30), { ...WORKDAY, days: [] })).toEqual(at(11, 9));
  });

  it('leaves a time alone when there is no window', () => {
    expect(fitToActiveHours(at(5, 3), undefined)).toEqual(at(5, 3));
  });
});

describe('interval reminders with active hours', () => {
  const every = (minutes: number, due: Date) =>
    baseReminder({
      dueDate: due.toISOString(),
      recurring: { frequency: 'interval', intervalMinutes: minutes, activeHours: WORKDAY },
    });
  const hourly = (activeHours: ReminderActiveHours) =>
    baseReminder({
      dueDate: at(5, 17, 30).toISOString(),
      recurring: { frequency: 'interval', intervalMinutes: 60, activeHours },
    });

  it('still fire at the window close when the previous fire ran a few seconds late', () => {
    expect(nextReminderDueDate(every(60, at(5, 17)), at(5, 17, 0, 5))).toEqual(at(5, 18, 0, 5));
  });

  it('do not fire past the close just because they are anchored off the hour', () => {
    expect(nextReminderDueDate(every(60, at(5, 17, 3)), at(5, 17, 3))).toEqual(at(6, 9));
  });

  it('do not keep firing a short interval past the close', () => {
    expect(nextReminderDueDate(every(1, at(5, 18)), at(5, 18))).toEqual(at(6, 9));
  });

  it('never count more than a few minutes of lateness toward the close', () => {
    expect(nextReminderDueDate(every(60, at(5, 16)), at(5, 17, 30))).toEqual(at(6, 9));
  });

  it('fire next at the following window start once the window has closed', () => {
    expect(nextReminderDueDate(hourly(WORKDAY), at(5, 17, 30))).toEqual(at(6, 9));
  });

  it('skip to the following window start once the window has closed', () => {
    expect(skipReminderOccurrence(hourly(WORKDAY))).toEqual(at(6, 9));
  });

  it('start inside the window when created outside it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(5, 6));

    expect(intervalDueDateFromNow(60, WORKDAY)).toEqual(at(5, 9));
  });
});

describe('firesPerActiveDay', () => {
  it('counts both ends of the window', () => {
    expect(firesPerActiveDay(60, WORKDAY)).toBe(10);
  });

  it('counts only the fires that land inside the window', () => {
    expect(firesPerActiveDay(45, WORKDAY)).toBe(13);
  });

  it('counts a window that crosses midnight', () => {
    expect(firesPerActiveDay(60, LATE)).toBe(5);
  });

  it('counts the opening of a whole-day window once', () => {
    expect(firesPerActiveDay(60, { start: '09:00', end: '09:00' })).toBe(24);
  });
});

describe('buildReminderRecurring', () => {
  it('carries active hours on an interval cadence', () => {
    expect(buildReminderRecurring(true, 'interval', 60, WORKDAY)).toEqual({
      frequency: 'interval',
      intervalMinutes: 60,
      activeHours: WORKDAY,
    });
  });

  it('leaves active hours off a calendar cadence', () => {
    expect(buildReminderRecurring(true, 'daily', 60, WORKDAY)).toEqual({ frequency: 'daily' });
  });
});
