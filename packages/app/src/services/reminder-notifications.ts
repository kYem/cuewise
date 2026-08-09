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
  reminderAlarmId,
  reminderIdFromAlarm,
} from '@cuewise/shared';
import { getReminders, updateReminders } from '@cuewise/storage';

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

    // One locked section reading fresh, not the list from before the notify: that round trip is
    // long enough for a pull to land, and every decision below has to be made against what it left.
    let nextDueDate: Date | null = null;
    const { result } = await updateReminders((current) =>
      current.map((r) => {
        if (r.id !== reminderId) {
          return r;
        }
        // Re-checked here, not from the pre-notify copy: a pull may have paused, completed or
        // re-cadenced this reminder, and advancing it then would undo that and arm a dead wake.
        if (r.recurring && !r.paused && !r.completed) {
          nextDueDate = nextReminderDueDate(r, new Date());
          return { ...r, dueDate: nextDueDate.toISOString(), notified: false, completed: false };
        }
        return { ...r, notified: true };
      })
    );
    // setReminders resolves {success:false} on quota rather than throwing, so the catch below
    // never sees it. Arming the next occurrence off an unpersisted advance would double-fire it.
    if (result?.success === false) {
      logger.error('Could not persist the fired reminder', result.error);
      return;
    }

    if (nextDueDate !== null) {
      await getScheduler().scheduleAt(reminderAlarmId(reminderId), nextDueDate);
    }
  } catch (error) {
    logger.error('Error handling reminder fire', error);
  }
}
