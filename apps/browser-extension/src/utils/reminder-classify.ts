import type { Reminder } from '@cuewise/shared';

export type ReminderState = 'notified' | 'overdue' | 'soon' | 'upcoming' | 'done';

const SOON_MS = 5 * 60 * 1000;

/**
 * Visual state for a reminder, consistent with the store's bucketing
 * (overdue = any past dueDate) plus the `notified` "needs response" overlay.
 */
export function classifyReminder(reminder: Reminder, now: Date = new Date()): ReminderState {
  if (reminder.completed) {
    return 'done';
  }
  // A paused recurring reminder can never fire — keep it calm/upcoming.
  if (reminder.paused) {
    return 'upcoming';
  }
  const msUntil = new Date(reminder.dueDate).getTime() - now.getTime();
  if (msUntil < 0) {
    return reminder.notified ? 'notified' : 'overdue';
  }
  if (msUntil <= SOON_MS) {
    return 'soon';
  }
  return 'upcoming';
}

/** Split into ambient interval "habits" and clock-anchored "scheduled" reminders. */
export function splitReminders(reminders: Reminder[]): {
  habits: Reminder[];
  scheduled: Reminder[];
} {
  const habits: Reminder[] = [];
  const scheduled: Reminder[] = [];
  for (const reminder of reminders) {
    if (reminder.recurring?.frequency === 'interval') {
      habits.push(reminder);
    } else {
      scheduled.push(reminder);
    }
  }
  return { habits, scheduled };
}
