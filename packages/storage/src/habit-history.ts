import { type HabitDay, habitDaySchema, recordHabitDay, STORAGE_KEYS } from '@cuewise/shared';
import { keepValidListItems, type StorageResult, setInStorage } from './chrome-storage';
import { withCollectionLock } from './collection-lock';
import { getListRaw } from './raw-list';

// Habit history: always local whatever syncEnabled says — one Chrome sync key caps at 8 KB.
export async function getHabitHistory(): Promise<HabitDay[]> {
  const raw = await getListRaw<unknown>(STORAGE_KEYS.HABIT_HISTORY, 'local');
  return keepValidListItems<HabitDay>(raw, habitDaySchema, STORAGE_KEYS.HABIT_HISTORY, 'local');
}

export async function getHabitHistoryRaw(): Promise<HabitDay[]> {
  return getListRaw<HabitDay>(STORAGE_KEYS.HABIT_HISTORY, 'local');
}

export async function setHabitHistoryRaw(days: HabitDay[]): Promise<StorageResult> {
  return setInStorage(STORAGE_KEYS.HABIT_HISTORY, days, 'local');
}

/**
 * One more done on `date`, pruning that habit's expired days; raw so a newer build's rows survive.
 * A whole value this build cannot read is started afresh, or no tick could ever record again.
 */
export async function recordHabitDone(
  reminderId: string,
  date: string
): Promise<{ result: StorageResult; changedId: string; prunedIds: string[] }> {
  return withCollectionLock('habitHistory', async () => {
    const { next, changedId, prunedIds } = recordHabitDay(
      await getListRaw<HabitDay>(STORAGE_KEYS.HABIT_HISTORY, 'local', { resetUnreadable: true }),
      reminderId,
      date
    );
    return { result: await setHabitHistoryRaw(next), changedId, prunedIds };
  });
}

async function removeHabitDaysWhere(
  matches: (entry: HabitDay) => boolean
): Promise<{ result: StorageResult; removedIds: string[] }> {
  return withCollectionLock('habitHistory', async () => {
    const days = await getHabitHistoryRaw();
    const removedIds = days.filter(matches).map((entry) => entry.id);
    if (removedIds.length === 0) {
      return { result: { success: true }, removedIds };
    }
    const result = await setHabitHistoryRaw(days.filter((entry) => !matches(entry)));
    return { result, removedIds };
  });
}

export async function removeHabitDays(
  reminderId: string
): Promise<{ result: StorageResult; removedIds: string[] }> {
  return removeHabitDaysWhere((entry) => entry.reminderId === reminderId);
}

/** Every habit's days before `cutoff`, including those of habits never ticked again. */
export async function removeHabitDaysBefore(
  cutoff: string
): Promise<{ result: StorageResult; removedIds: string[] }> {
  return removeHabitDaysWhere((entry) => entry.date < cutoff);
}
