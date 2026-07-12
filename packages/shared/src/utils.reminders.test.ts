import { describe, expect, it } from 'vitest';
import { baseReminder } from './__fixtures__/reminders.fixtures';
import {
  DEFAULT_REMINDER_INTERVAL_MINUTES,
  REMINDER_INTERVAL_MAX,
  REMINDER_INTERVAL_MIN,
  REMINDER_SNOOZE_MINUTES,
  REMINDER_TEMPLATES,
} from './constants';
import {
  buildReminderRecurring,
  clampIntervalMinutes,
  formatCompactInterval,
  formatReminderCadence,
  intervalDueDateFromNow,
  isUpcomingRecurringOccurrence,
  nextReminderDueDate,
  reminderAlarmId,
  reminderIdFromAlarm,
  resolveReminderNotificationAction,
  skipReminderOccurrence,
} from './utils';

describe('clampIntervalMinutes', () => {
  it('returns the value when within range', () => {
    expect(clampIntervalMinutes(1)).toBe(1);
    expect(clampIntervalMinutes(30)).toBe(30);
    expect(clampIntervalMinutes(REMINDER_INTERVAL_MAX)).toBe(480);
  });

  it('floors to an integer', () => {
    expect(clampIntervalMinutes(30.7)).toBe(30);
  });

  it('clamps below the minimum up to 1', () => {
    expect(clampIntervalMinutes(0)).toBe(REMINDER_INTERVAL_MIN);
    expect(clampIntervalMinutes(-5)).toBe(REMINDER_INTERVAL_MIN);
  });

  it('clamps above the maximum down to 480', () => {
    expect(clampIntervalMinutes(10000)).toBe(REMINDER_INTERVAL_MAX);
  });

  it('falls back to the default for non-finite input', () => {
    expect(clampIntervalMinutes(Number.NaN)).toBe(DEFAULT_REMINDER_INTERVAL_MINUTES);
    expect(clampIntervalMinutes(Number.POSITIVE_INFINITY)).toBe(REMINDER_INTERVAL_MAX);
    expect(clampIntervalMinutes(Number.NEGATIVE_INFINITY)).toBe(REMINDER_INTERVAL_MIN);
  });
});

describe('formatCompactInterval', () => {
  it('renders sub-hour minutes with an "m" suffix', () => {
    expect(formatCompactInterval(30)).toBe('30m');
    expect(formatCompactInterval(45)).toBe('45m');
  });

  it('renders whole hours with an "h" suffix', () => {
    expect(formatCompactInterval(60)).toBe('1h');
    expect(formatCompactInterval(180)).toBe('3h');
  });

  it('renders hours and minutes together', () => {
    expect(formatCompactInterval(90)).toBe('1h 30m');
  });
});

describe('nextReminderDueDate', () => {
  it("anchors 'interval' to fire-time (now + intervalMinutes)", () => {
    const now = new Date('2026-06-13T10:00:00.000Z');
    const reminder = baseReminder({
      dueDate: '2026-06-13T09:00:00.000Z', // stale; must be ignored
      recurring: { frequency: 'interval', intervalMinutes: 30 },
    });
    expect(nextReminderDueDate(reminder, now).toISOString()).toBe('2026-06-13T10:30:00.000Z');
  });

  it("advances 'daily' to the next future occurrence", () => {
    const now = new Date('2026-06-13T10:00:00.000Z');
    const reminder = baseReminder({
      dueDate: '2026-06-10T08:00:00.000Z', // 3 days overdue
      recurring: { frequency: 'daily' },
    });
    expect(nextReminderDueDate(reminder, now).toISOString()).toBe('2026-06-14T08:00:00.000Z');
  });

  it("advances 'weekly' by 7 days from the due date", () => {
    const now = new Date('2026-06-13T10:00:00.000Z');
    const reminder = baseReminder({
      dueDate: '2026-06-12T08:00:00.000Z',
      recurring: { frequency: 'weekly' },
    });
    expect(nextReminderDueDate(reminder, now).toISOString()).toBe('2026-06-19T08:00:00.000Z');
  });
});

describe('skipReminderOccurrence', () => {
  it('adds one cadence to the scheduled dueDate for interval reminders', () => {
    const dueTime = new Date('2026-06-13T09:30:00.000Z').getTime();
    const reminder = baseReminder({
      dueDate: new Date(dueTime).toISOString(),
      recurring: { frequency: 'interval', intervalMinutes: 30 },
    });
    expect(skipReminderOccurrence(reminder).getTime()).toBe(dueTime + 30 * 60_000);
  });

  it('advances a daily reminder one day keeping its clock time', () => {
    // 9pm local today → 9pm local tomorrow, regardless of "now".
    const due = new Date(2026, 5, 13, 21, 0, 0, 0);
    const reminder = baseReminder({
      dueDate: due.toISOString(),
      recurring: { frequency: 'daily' },
    });
    const result = skipReminderOccurrence(reminder);
    expect(result.getHours()).toBe(21);
    expect(result.getMinutes()).toBe(0);
    expect(result.getDate()).toBe(due.getDate() + 1);
  });

  it('advances a weekly reminder by 7 days keeping its clock time', () => {
    const due = new Date(2026, 5, 12, 8, 15, 0, 0);
    const reminder = baseReminder({
      dueDate: due.toISOString(),
      recurring: { frequency: 'weekly' },
    });
    const result = skipReminderOccurrence(reminder);
    expect(result.getTime()).toBe(due.getTime() + 7 * 24 * 60 * 60_000);
    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(15);
  });

  it('advances a monthly reminder by one month keeping its day and clock time', () => {
    const due = new Date(2026, 5, 10, 8, 0, 0, 0); // June 10
    const reminder = baseReminder({
      dueDate: due.toISOString(),
      recurring: { frequency: 'monthly' },
    });
    const result = skipReminderOccurrence(reminder);
    expect(result.getMonth()).toBe(6); // July
    expect(result.getDate()).toBe(10);
    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(0);
  });
});

describe('isUpcomingRecurringOccurrence', () => {
  const now = new Date('2026-06-13T12:00:00.000Z');

  it('is true for a recurring reminder whose dueDate is still in the future', () => {
    const reminder = baseReminder({
      dueDate: new Date(now.getTime() + 30 * 60_000).toISOString(),
      recurring: { frequency: 'interval', intervalMinutes: 30 },
    });
    expect(isUpcomingRecurringOccurrence(reminder, now)).toBe(true);
  });

  it('is false once a recurring reminder is due/overdue (restart, not skip)', () => {
    const reminder = baseReminder({
      dueDate: new Date(now.getTime() - 60_000).toISOString(),
      recurring: { frequency: 'interval', intervalMinutes: 30 },
    });
    expect(isUpcomingRecurringOccurrence(reminder, now)).toBe(false);
  });

  it('is false for a non-recurring reminder even when it is in the future', () => {
    const reminder = baseReminder({ dueDate: new Date(now.getTime() + 60_000).toISOString() });
    expect(isUpcomingRecurringOccurrence(reminder, now)).toBe(false);
  });

  it('is false for a completed recurring reminder', () => {
    const reminder = baseReminder({
      completed: true,
      dueDate: new Date(now.getTime() + 60_000).toISOString(),
      recurring: { frequency: 'daily' },
    });
    expect(isUpcomingRecurringOccurrence(reminder, now)).toBe(false);
  });

  it('is false when dueDate exactly equals now (strict >, so it restarts not skips)', () => {
    const reminder = baseReminder({
      dueDate: new Date(now.getTime()).toISOString(),
      recurring: { frequency: 'interval', intervalMinutes: 30 },
    });
    expect(isUpcomingRecurringOccurrence(reminder, now)).toBe(false);
  });
});

describe('REMINDER_TEMPLATES move preset', () => {
  it('includes a 30-minute interval movement template', () => {
    const move = REMINDER_TEMPLATES.find((t) => t.id === 'move');
    expect(move).toBeDefined();
    expect(move?.frequency).toBe('interval');
    expect(move?.intervalMinutes).toBe(30);
    expect(move?.category).toBe('health');
  });
});

describe('formatReminderCadence', () => {
  it('formats interval reminders in minutes', () => {
    expect(formatReminderCadence({ frequency: 'interval', intervalMinutes: 30 })).toBe(
      'every 30 min'
    );
  });
  it('passes calendar frequencies through', () => {
    expect(formatReminderCadence({ frequency: 'daily' })).toBe('daily');
  });
});

describe('buildReminderRecurring', () => {
  it('returns undefined when not recurring', () => {
    expect(buildReminderRecurring(false, 'daily', 30)).toBeUndefined();
  });

  it('returns a frequency-only payload for calendar cadences', () => {
    expect(buildReminderRecurring(true, 'daily', 30)).toEqual({ frequency: 'daily' });
  });

  it('carries intervalMinutes for interval cadences', () => {
    expect(buildReminderRecurring(true, 'interval', 30)).toEqual({
      frequency: 'interval',
      intervalMinutes: 30,
    });
  });
});

describe('intervalDueDateFromNow', () => {
  it('returns a Date roughly N minutes in the future', () => {
    const before = Date.now();
    const d = intervalDueDateFromNow(30);
    expect(d.getTime()).toBeGreaterThanOrEqual(before + 30 * 60_000);
    expect(d.getTime()).toBeLessThanOrEqual(Date.now() + 30 * 60_000 + 1000);
  });
});

describe('resolveReminderNotificationAction', () => {
  const now = new Date('2026-06-13T10:00:00.000Z');
  const expectedSnoozeDueDate = new Date(
    now.getTime() + REMINDER_SNOOZE_MINUTES * 60_000
  ).toISOString();

  it('Done completes a one-off reminder', () => {
    const reminder = baseReminder({ recurring: undefined });
    expect(resolveReminderNotificationAction(reminder, 0, now)).toEqual({ type: 'complete' });
  });

  it('Done dismisses an active recurring reminder', () => {
    const reminder = baseReminder({ recurring: { frequency: 'daily' } });
    expect(resolveReminderNotificationAction(reminder, 0, now)).toEqual({ type: 'dismiss' });
  });

  it('Done dismisses a paused recurring reminder', () => {
    const reminder = baseReminder({ recurring: { frequency: 'daily' }, paused: true });
    expect(resolveReminderNotificationAction(reminder, 0, now)).toEqual({ type: 'dismiss' });
  });

  it('Snooze reschedules an active recurring reminder to now + 5 min', () => {
    const reminder = baseReminder({ recurring: { frequency: 'daily' } });
    expect(resolveReminderNotificationAction(reminder, 1, now)).toEqual({
      type: 'snooze',
      dueDate: expectedSnoozeDueDate,
    });
  });

  it('Snooze reschedules a one-off reminder to now + 5 min', () => {
    const reminder = baseReminder({ recurring: undefined });
    expect(resolveReminderNotificationAction(reminder, 1, now)).toEqual({
      type: 'snooze',
      dueDate: expectedSnoozeDueDate,
    });
  });

  it('Snooze dismisses a paused recurring reminder', () => {
    const reminder = baseReminder({ recurring: { frequency: 'daily' }, paused: true });
    expect(resolveReminderNotificationAction(reminder, 1, now)).toEqual({ type: 'dismiss' });
  });

  it('dismisses an undefined reminder', () => {
    expect(resolveReminderNotificationAction(undefined, 0, now)).toEqual({ type: 'dismiss' });
  });

  it('dismisses an unknown button index', () => {
    const reminder = baseReminder({ recurring: undefined });
    expect(resolveReminderNotificationAction(reminder, 2, now)).toEqual({ type: 'dismiss' });
  });
});

describe('reminder alarm ids', () => {
  it('round-trips a reminder id through the alarm id', () => {
    expect(reminderIdFromAlarm(reminderAlarmId('abc-123'))).toBe('abc-123');
  });

  it('prefixes the id with reminder-', () => {
    expect(reminderAlarmId('abc-123')).toBe('reminder-abc-123');
  });

  it('returns null for an alarm id that is not a reminder', () => {
    expect(reminderIdFromAlarm('pomodoro-complete')).toBeNull();
  });
});
