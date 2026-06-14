import type { Reminder } from '@cuewise/shared';
import {
  completedReminderFactory,
  recurringReminderFactory,
  reminderFactory,
} from '@cuewise/test-utils/factories';
import { describe, expect, it } from 'vitest';
import {
  buildReminderUrgencyNote,
  classifyReminder,
  type ReminderState,
  splitReminders,
} from './reminder-classify';

const NOW = new Date('2026-06-14T10:00:00.000Z');

function dueIn(ms: number): string {
  return new Date(NOW.getTime() + ms).toISOString();
}

function statesFor(reminders: Reminder[]): Map<string, ReminderState> {
  return new Map(reminders.map((r) => [r.id, classifyReminder(r, NOW)]));
}

describe('classifyReminder', () => {
  it('returns "done" for completed reminders', () => {
    const reminder = completedReminderFactory.build({ dueDate: dueIn(-60 * 60 * 1000) });
    expect(classifyReminder(reminder, NOW)).toBe('done');
  });

  it('returns "upcoming" for a paused recurring reminder even when overdue', () => {
    const reminder = recurringReminderFactory.build({
      paused: true,
      dueDate: dueIn(-60 * 60 * 1000),
    });
    expect(classifyReminder(reminder, NOW)).toBe('upcoming');
  });

  it('returns "notified" for a past reminder that has been notified', () => {
    const reminder = reminderFactory.build({ dueDate: dueIn(-60 * 1000), notified: true });
    expect(classifyReminder(reminder, NOW)).toBe('notified');
  });

  it('returns "overdue" for a past reminder that has not been notified', () => {
    const reminder = reminderFactory.build({ dueDate: dueIn(-60 * 1000), notified: false });
    expect(classifyReminder(reminder, NOW)).toBe('overdue');
  });

  it('returns "soon" for a reminder due in exactly 5 minutes', () => {
    const reminder = reminderFactory.build({ dueDate: dueIn(5 * 60 * 1000) });
    expect(classifyReminder(reminder, NOW)).toBe('soon');
  });

  it('returns "upcoming" for a reminder due in ~10 minutes', () => {
    const reminder = reminderFactory.build({ dueDate: dueIn(10 * 60 * 1000) });
    expect(classifyReminder(reminder, NOW)).toBe('upcoming');
  });
});

describe('buildReminderUrgencyNote', () => {
  it('prioritizes a notified reminder with "Awaiting your response"', () => {
    const notified = reminderFactory.build({ dueDate: dueIn(-60 * 1000), notified: true });
    const overdue = reminderFactory.build({ dueDate: dueIn(-60 * 1000), notified: false });
    const reminders = [notified, overdue];

    expect(buildReminderUrgencyNote(reminders, statesFor(reminders))).toEqual({
      text: 'Awaiting your response',
      tone: 'notified',
    });
  });

  it('counts overdue reminders when none are notified', () => {
    const reminders = [
      reminderFactory.build({ dueDate: dueIn(-60 * 1000), notified: false }),
      reminderFactory.build({ dueDate: dueIn(-120 * 1000), notified: false }),
    ];

    expect(buildReminderUrgencyNote(reminders, statesFor(reminders))).toEqual({
      text: '2 overdue',
      tone: 'overdue',
    });
  });

  it('surfaces the soonest reminder with a "Next in" countdown', () => {
    const reminders = [reminderFactory.build({ dueDate: dueIn(2 * 60 * 1000) })];

    const note = buildReminderUrgencyNote(reminders, statesFor(reminders));

    expect(note?.tone).toBe('soon');
    expect(note?.text).toMatch(/^Next in /);
  });

  it('returns null when nothing is urgent', () => {
    const reminders = [reminderFactory.build({ dueDate: dueIn(30 * 60 * 1000) })];

    expect(buildReminderUrgencyNote(reminders, statesFor(reminders))).toBeNull();
  });
});

describe('splitReminders', () => {
  it('routes interval reminders to habits and others to scheduled', () => {
    const interval = reminderFactory.build({
      recurring: { frequency: 'interval', intervalMinutes: 30 },
    });
    const daily = recurringReminderFactory.build();
    const oneOff = reminderFactory.build();

    const { habits, scheduled } = splitReminders([interval, daily, oneOff]);

    expect(habits).toEqual([interval]);
    expect(scheduled).toEqual([daily, oneOff]);
  });
});
