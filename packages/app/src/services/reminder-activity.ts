/**
 * A short, device-local trace of what the reminder pipeline did — armed, fired, snoozed,
 * skipped — so a missed fire can be diagnosed after the fact. The logger cannot do this: it
 * writes to the console, and the service worker's console dies with the idle worker.
 * Free of React/UI imports so the service-worker bundle can pull it in.
 */

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
  | 'advanced';

export interface ReminderActivityEntry {
  at: string;
  realm: 'worker' | 'page';
  event: ReminderActivityEvent;
  reminderId?: string;
  text?: string;
  detail?: string;
}

export type ReminderActivity = Omit<ReminderActivityEntry, 'at' | 'realm'>;

export function activitySubject(reminder: Reminder): Pick<ReminderActivity, 'reminderId' | 'text'> {
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
      const current =
        (await store.get<ReminderActivityEntry[]>(REMINDER_ACTIVITY_KEY, 'local')) ?? [];
      const next = [...current, entry].slice(-REMINDER_ACTIVITY_LIMIT);
      const result = await store.set(REMINDER_ACTIVITY_KEY, next, 'local');
      if (!result.success) {
        logger.warn('Could not record reminder activity', { error: result.error });
      }
    });
  } catch (error) {
    logger.warn('Could not record reminder activity', { error });
  }
}
