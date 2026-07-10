/**
 * Shared reminder fire→deliver logic. Runs wherever a resident host fires a
 * scheduled wake — the extension's service worker and the macOS Rust scheduler —
 * so both platforms deliver reminders identically. Kept free of React/UI imports
 * so it can be pulled into the service-worker bundle via the `@cuewise/app/
 * reminder-notifications` subpath without dragging in the app.
 */

import {
  getNotifier,
  getScheduler,
  logger,
  nextReminderDueDate,
  type Reminder,
  reminderAlarmId,
  reminderIdFromAlarm,
} from '@cuewise/shared';
import { getReminders, setReminders } from '@cuewise/storage';

/**
 * Deliver a reminder's notification when its scheduled wake fires. Looks the
 * reminder up by the alarm id, notifies (with Done/Snooze actions), marks it
 * notified, and re-arms the next occurrence for recurring reminders. A no-op for
 * non-reminder alarm ids, or reminders that are gone / completed / paused.
 */
export async function handleReminderFire(alarmId: string): Promise<void> {
  const reminderId = reminderIdFromAlarm(alarmId);
  if (reminderId === null) {
    return;
  }

  try {
    const reminders = await getReminders();
    const reminder = reminders.find((r) => r.id === reminderId);

    if (!reminder) {
      logger.warn(`Reminder ${reminderId} not found`);
      return;
    }

    if (reminder.completed) {
      return;
    }

    // Paused recurring reminders must neither notify nor re-arm.
    if (reminder.recurring && reminder.paused) {
      return;
    }

    await getNotifier().notify({
      id: reminderAlarmId(reminderId),
      title: '🔔 Reminder',
      body: reminder.text,
      actions: ['Done', 'Snooze 5 min'],
      requireInteraction: true,
    });

    const updatedReminders = reminders.map((r) =>
      r.id === reminderId ? { ...r, notified: true } : r
    );
    await setReminders(updatedReminders);

    if (reminder.recurring) {
      await scheduleNextOccurrence(reminder);
    }
  } catch (error) {
    logger.error('Error handling reminder fire', error);
  }
}

/** Advance a recurring reminder to its next occurrence and re-arm its wake. */
async function scheduleNextOccurrence(reminder: Reminder): Promise<void> {
  const nextDueDate = nextReminderDueDate(reminder, new Date());

  const reminders = await getReminders();
  const updatedReminders = reminders.map((r) =>
    r.id === reminder.id
      ? { ...r, dueDate: nextDueDate.toISOString(), notified: false, completed: false }
      : r
  );
  await setReminders(updatedReminders);

  await getScheduler().scheduleAt(reminderAlarmId(reminder.id), nextDueDate);
}
