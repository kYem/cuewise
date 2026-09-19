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
import { activitySubject, recordReminderActivity } from './reminder-activity';

/**
 * Arm every reminder that should have a wake but whose alarm id is not in `armed`. Runs
 * wherever a host has just lost its wakes: the extension service worker on install, update
 * and browser start (chrome.alarms are cleared on update), the macOS app on every launch
 * (Rust timers are in-memory). An overdue one arms at its past due date and fires at once —
 * delivered late rather than never.
 */
export async function armMissingReminderAlarms(armed: ReadonlySet<string>): Promise<void> {
  const reminders = await getReminders();
  let pending = 0;
  let rearmed = 0;
  for (const reminder of reminders) {
    if (reminder.completed || reminder.paused) {
      continue;
    }
    if (!reminder.recurring && reminder.notified) {
      continue;
    }
    pending += 1;
    const alarmId = reminderAlarmId(reminder.id);
    if (armed.has(alarmId)) {
      continue;
    }
    try {
      await getScheduler().scheduleAt(alarmId, new Date(reminder.dueDate));
      rearmed += 1;
    } catch (error) {
      logger.error(`Failed to re-arm reminder ${reminder.id}`, error);
    }
  }
  await recordReminderActivity({
    event: 'reconciled',
    detail: `re-armed ${rearmed} of ${pending} pending`,
  });
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
      await recordReminderActivity({ event: 'skipped', reminderId, detail: 'not found' });
      return;
    }

    if (reminder.completed) {
      await recordReminderActivity({
        event: 'skipped',
        ...activitySubject(reminder),
        detail: 'completed',
      });
      return;
    }

    // Paused recurring reminders must neither notify nor re-arm.
    if (reminder.recurring && reminder.paused) {
      await recordReminderActivity({
        event: 'skipped',
        ...activitySubject(reminder),
        detail: 'paused',
      });
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
    let nextDueDate = null as Date | null;
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
      await recordReminderActivity({
        event: 'fired',
        ...activitySubject(reminder),
        detail: 'not persisted',
      });
      return;
    }

    if (nextDueDate !== null) {
      await getScheduler().scheduleAt(reminderAlarmId(reminderId), nextDueDate);
    }
    await recordReminderActivity({
      event: 'fired',
      ...activitySubject(reminder),
      ...(nextDueDate !== null ? { detail: `next ${nextDueDate.toISOString()}` } : {}),
    });
  } catch (error) {
    logger.error('Error handling reminder fire', error);
  }
}
