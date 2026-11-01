import { type Reminder, reminderSchema, STORAGE_KEYS } from '@cuewise/shared';
import {
  keepValidListItems,
  type StorageResult,
  setInStorage,
  setValidatedListInStorage,
} from './chrome-storage';
import { withCollectionLock } from './collection-lock';
import { getListRaw } from './raw-list';
import { getStorageArea } from './settings';

/** Raw-then-validate for the same reason as getGoals. */
export async function getReminders(): Promise<Reminder[]> {
  const area = await getStorageArea();
  const raw = await getListRaw<unknown>(STORAGE_KEYS.REMINDERS, area);
  return keepValidListItems<Reminder>(raw, reminderSchema, STORAGE_KEYS.REMINDERS, area);
}

export async function setReminders(reminders: Reminder[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setValidatedListInStorage(STORAGE_KEYS.REMINDERS, reminders, reminderSchema, area);
}

/** Changes the reminder list, reading inside the lock. See `updateGoals` for why. */
export async function updateReminders(
  mutate: (reminders: Reminder[]) => Reminder[]
): Promise<{ result: StorageResult; reminders: Reminder[] }> {
  return withCollectionLock('reminders', async () => {
    const reminders = mutate(await getReminders());
    return { result: await setReminders(reminders), reminders };
  });
}

export async function getRemindersRaw(): Promise<Reminder[]> {
  return getListRaw<Reminder>(STORAGE_KEYS.REMINDERS, await getStorageArea());
}

export async function setRemindersRaw(reminders: Reminder[]): Promise<StorageResult> {
  return setInStorage(STORAGE_KEYS.REMINDERS, reminders, await getStorageArea());
}
