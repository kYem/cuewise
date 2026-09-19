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
  type NotifyOptions,
  nextReminderDueDate,
  reminderAlarmId,
  reminderIdFromAlarm,
} from '@cuewise/shared';
import { getReminders, readSettings, updateReminders } from '@cuewise/storage';

// A reminder-prefixed id that matches no stored reminder: the host's click and button handlers
// then resolve it to dismiss-and-clear, so Done / Snooze on the test simply close it.
export const REMINDER_TEST_NOTIFICATION_ID = reminderAlarmId('test');

/** The one shape every reminder notification takes, so a test notification is a real preview. */
export function reminderNotification(id: string, body: string): NotifyOptions {
  return {
    id,
    title: '🔔 Reminder',
    body,
    actions: ['Done', 'Snooze 5 min'],
    requireInteraction: true,
  };
}

/**
 * The Settings → Notifications switch, read from storage because the service worker has no
 * settings store. A failed read is not a "no": the default is on, and a storage hiccup must
 * not silence reminders.
 */
export async function notificationsEnabled(): Promise<boolean> {
  const read = await readSettings();
  if (!read.ok) {
    return true;
  }
  return read.settings.enableNotifications;
}

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

    if (await notificationsEnabled()) {
      await getNotifier().notify(reminderNotification(reminderAlarmId(reminderId), reminder.text));
    }

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
