import {
  formatDateString,
  logger,
  notifyDeletedBulk,
  notifyMutated,
  type Reminder,
  targetDayOf,
} from '@cuewise/shared';
import { recordHabitDone, removeHabitDays } from '@cuewise/storage';

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

export async function forgetHabit(reminderId: string): Promise<void> {
  try {
    const { result, removedIds } = await removeHabitDays(reminderId);
    if (!result.success) {
      logger.error('Could not remove the habit history', result.error);
      return;
    }
    notifyDeletedBulk('habitHistory', removedIds);
  } catch (error) {
    logger.error('Could not remove the habit history', error);
  }
}
