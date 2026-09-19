// Device-local trace of the reminder pipeline so a missed fire can be diagnosed after the fact.
// The logger cannot: it is console-only, and the worker's console dies with the idle worker.

import { getStorage, logger, type Reminder } from '@cuewise/shared';
import { withCollectionLock } from '@cuewise/storage';

export const REMINDER_ACTIVITY_KEY = 'reminderActivity';
export const REMINDER_ACTIVITY_LIMIT = 20;
const TEXT_LIMIT = 40;

export type ReminderActivityEvent =
  | 'armed'
  | 'cancelled'
  | 'fired'
  | 'skipped'
  | 'toasted'
  | 'done'
  | 'snoozed'
  | 'reconciled'
  | 'advanced'
  | 'failed';

export interface ReminderActivityEntry {
  at: string;
  realm: 'worker' | 'page';
  event: ReminderActivityEvent;
  reminderId?: string;
  text?: string;
  detail?: string;
}

export type ReminderActivity = Omit<ReminderActivityEntry, 'at' | 'realm'>;

export function activitySubject(reminder: Reminder): { reminderId: string; text: string } {
  return { reminderId: reminder.id, text: reminder.text.slice(0, TEXT_LIMIT) };
}

function currentRealm(): ReminderActivityEntry['realm'] {
  return typeof document === 'undefined' ? 'worker' : 'page';
}

/** Never throws: a diagnostics write failing must not touch the reminder it describes. */
export async function recordReminderActivity(activity: ReminderActivity): Promise<void> {
  const entry: ReminderActivityEntry = {
    at: new Date().toISOString(),
    realm: currentRealm(),
    ...activity,
  };
  try {
    await withCollectionLock('reminderActivity', async () => {
      const store = getStorage();
      // A failed read must not become a one-entry log: skip the write and keep what is there.
      // A stored value that is unreadable or not a list is garbage worth replacing.
      const stored = await store.getMany([REMINDER_ACTIVITY_KEY], 'local');
      if (stored === null) {
        logger.error('Could not read the reminder activity log; entry dropped', undefined, {
          entry,
        });
        return;
      }
      const slot = stored[REMINDER_ACTIVITY_KEY];
      const current: ReminderActivityEntry[] =
        slot?.readable && Array.isArray(slot.value) ? slot.value : [];
      const next = [...current, entry].slice(-REMINDER_ACTIVITY_LIMIT);
      const result = await store.set(REMINDER_ACTIVITY_KEY, next, 'local');
      if (!result.success) {
        logger.warn('Could not record reminder activity', { error: result.error });
      }
    });
  } catch (error) {
    logger.error('Could not record reminder activity', error, { entry });
  }
}
