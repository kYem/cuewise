import { logger } from '@cuewise/shared';
import { reminderFactory } from '@cuewise/test-utils/factories';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activitySubject,
  REMINDER_ACTIVITY_KEY,
  REMINDER_ACTIVITY_LIMIT,
  type ReminderActivityEntry,
  recordReminderActivity,
} from './reminder-activity';

async function readLog(): Promise<ReminderActivityEntry[]> {
  const stored = await chrome.storage.local.get(REMINDER_ACTIVITY_KEY);
  return (stored[REMINDER_ACTIVITY_KEY] as ReminderActivityEntry[] | undefined) ?? [];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recordReminderActivity', () => {
  it('appends a timestamped entry from the page realm', async () => {
    await recordReminderActivity({ event: 'armed', reminderId: 'r1', detail: 'due 21:00' });

    const [entry] = await readLog();
    expect(entry).toMatchObject({ event: 'armed', reminderId: 'r1', detail: 'due 21:00' });
    expect(entry.realm).toBe('page');
    expect(new Date(entry.at).getTime()).not.toBeNaN();
  });

  it('names the worker realm where there is no document', async () => {
    vi.stubGlobal('document', undefined);

    await recordReminderActivity({ event: 'fired', reminderId: 'r1' });

    const [entry] = await readLog();
    expect(entry.realm).toBe('worker');
  });

  it('keeps only the newest entries once the limit is reached', async () => {
    for (let i = 0; i < REMINDER_ACTIVITY_LIMIT + 1; i += 1) {
      await recordReminderActivity({ event: 'armed', reminderId: `r${i}` });
    }

    const log = await readLog();
    expect(log).toHaveLength(REMINDER_ACTIVITY_LIMIT);
    expect(log[0].reminderId).toBe('r1');
    expect(log[REMINDER_ACTIVITY_LIMIT - 1].reminderId).toBe(`r${REMINDER_ACTIVITY_LIMIT}`);
  });

  it('swallows a failed write so the reminder path is unaffected', async () => {
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('quota'));
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    await expect(
      recordReminderActivity({ event: 'fired', reminderId: 'r1' })
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('Could not record reminder activity', expect.anything());
  });
});

describe('activitySubject', () => {
  it('carries the id and a short form of the text', () => {
    const reminder = reminderFactory.build({ id: 'r1', text: 'x'.repeat(60) });

    expect(activitySubject(reminder)).toEqual({ reminderId: 'r1', text: 'x'.repeat(40) });
  });
});
