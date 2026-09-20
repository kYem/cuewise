/**
 * Fire→deliver logic and the start-up wake reconcile, shared by every resident host (extension
 * worker, macOS). No React/UI imports: the worker bundle pulls this subpath in on its own.
 */

import {
  describeThrown,
  getNotifier,
  getScheduler,
  logger,
  nextReminderDueDate,
  type Reminder,
  reminderAlarmId,
  reminderIdFromAlarm,
} from '@cuewise/shared';
import { getReminders, updateReminders } from '@cuewise/storage';
import { activitySubject, recordReminderActivity } from './reminder-activity';

export interface ReminderAlarmReconcile {
  pending: number;
  rearmed: number;
  /** Reminder ids whose wake could not be scheduled. */
  failed: string[];
}

/**
 * Fills the wakes a host lost (chrome.alarms on update, Rust timers on launch). An overdue one
 * arms at its past due date and fires on the next tick — delivered late rather than never.
 */
export async function armMissingReminderAlarms(
  reminders: Reminder[],
  armedAlarmIds: ReadonlySet<string>
): Promise<ReminderAlarmReconcile> {
  const tally: ReminderAlarmReconcile = { pending: 0, rearmed: 0, failed: [] };
  for (const reminder of reminders) {
    if (reminder.completed || reminder.paused) {
      continue;
    }
    if (!reminder.recurring && reminder.notified) {
      continue;
    }
    tally.pending += 1;
    const alarmId = reminderAlarmId(reminder.id);
    if (armedAlarmIds.has(alarmId)) {
      continue;
    }
    try {
      await getScheduler().scheduleAt(alarmId, new Date(reminder.dueDate));
      tally.rearmed += 1;
    } catch (error) {
      logger.error(`Failed to re-arm reminder ${reminder.id}`, error);
      tally.failed.push(reminder.id);
    }
  }
  const failed = tally.failed.length > 0 ? `, failed: ${tally.failed.join(' ')}` : '';
  await recordReminderActivity({
    event: 'reconciled',
    detail: `re-armed ${tally.rearmed} of ${tally.pending} pending${failed}`,
  });
  return tally;
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

  // Named so the failure entry says which step broke: the one thing a missed fire needs recorded.
  let step = 'lookup';
  let reminder: Reminder | undefined;
  try {
    const reminders = await getReminders();
    reminder = reminders.find((r) => r.id === reminderId);

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

    step = 'notify';
    await getNotifier().notify({
      id: reminderAlarmId(reminderId),
      title: '🔔 Reminder',
      body: reminder.text,
      actions: ['Done', 'Snooze 5 min'],
      requireInteraction: true,
    });

    // One locked section reading fresh, not the list from before the notify: that round trip is
    // long enough for a pull to land, and every decision below has to be made against what it left.
    step = 'persist';
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
        event: 'failed',
        ...activitySubject(reminder),
        detail: 'persist: not persisted',
      });
      return;
    }

    if (nextDueDate !== null) {
      step = 're-arm';
      await getScheduler().scheduleAt(reminderAlarmId(reminderId), nextDueDate);
    }
    await recordReminderActivity({
      event: 'fired',
      ...activitySubject(reminder),
      ...(nextDueDate !== null ? { detail: `next ${nextDueDate.toISOString()}` } : {}),
    });
  } catch (error) {
    logger.error('Error handling reminder fire', error);
    await recordReminderActivity({
      event: 'failed',
      ...(reminder ? activitySubject(reminder) : { reminderId }),
      detail: `${step}: ${describeThrown(error)}`,
    });
  }
}
