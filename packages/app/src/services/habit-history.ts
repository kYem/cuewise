import {
  formatDateString,
  habitHistorySweepCutoff,
  logger,
  notifyDeletedBulk,
  notifyMutated,
  type Reminder,
  type StorageResult,
  targetDayOf,
} from '@cuewise/shared';
import { recordHabitDone, removeHabitDays, removeHabitDaysBefore } from '@cuewise/storage';

/** Best-effort: the reminder write already landed, so a lost history day must not fail the Done. */
export async function recordHabitTick(reminder: Reminder, now: Date): Promise<void> {
  if (reminder.recurring?.frequency !== 'interval') {
    return;
  }
  const date = formatDateString(targetDayOf(reminder, now));
  try {
    const { result, changedId, prunedIds } = await recordHabitDone(reminder.id, date);
    if (!result.success) {
      logger.error('Could not record the habit day', result.error);
      return;
    }
    notifyMutated('habitHistory', changedId);
    notifyDeletedBulk('habitHistory', prunedIds);
  } catch (error) {
    logger.error('Could not record the habit day', error);
  }
}

async function removeDays(
  remove: () => Promise<{ result: StorageResult; removedIds: string[] }>
): Promise<void> {
  try {
    const { result, removedIds } = await remove();
    if (!result.success) {
      logger.error('Could not remove the habit history', result.error);
      return;
    }
    notifyDeletedBulk('habitHistory', removedIds);
  } catch (error) {
    logger.error('Could not remove the habit history', error);
  }
}

export async function forgetHabit(reminderId: string): Promise<void> {
  await removeDays(() => removeHabitDays(reminderId));
}

/** By date alone: a reminder-presence check would delete days whose reminder a pull hasn't landed. */
export async function pruneExpiredHabitDays(now: Date): Promise<void> {
  await removeDays(() => removeHabitDaysBefore(habitHistorySweepCutoff(now)));
}
