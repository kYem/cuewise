import { configurePlatform, logger } from '@cuewise/shared';
import { ChromeKeyValueStore } from '@cuewise/storage';
import { reminderFactory } from '@cuewise/test-utils/factories';
import { installLockManagerMock } from '@cuewise/test-utils/mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('replaces a stored value that is not a list', async () => {
    await chrome.storage.local.set({ [REMINDER_ACTIVITY_KEY]: 'garbage' });

    await recordReminderActivity({ event: 'fired', reminderId: 'r1' });

    expect((await readLog()).map((e) => e.reminderId)).toEqual(['r1']);
  });

  it('drops the entry rather than the log when the read fails', async () => {
    await recordReminderActivity({ event: 'armed', reminderId: 'kept' });
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(new Error('storage unavailable'));
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await recordReminderActivity({ event: 'fired', reminderId: 'dropped' });

    expect((await readLog()).map((e) => e.reminderId)).toEqual(['kept']);
    expect(errorLog).toHaveBeenCalledWith(
      'Could not read the reminder activity log; entry dropped',
      undefined,
      expect.anything()
    );
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

// The page and the worker write this log at the same instant on a fire; without the lock the
// read-modify-write drops entries.
describe('recordReminderActivity under the collection lock', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installLockManagerMock();
    configurePlatform({ storage: new ChromeKeyValueStore() });
  });

  afterEach(() => restore());

  it('keeps every concurrent entry, in order', async () => {
    await Promise.all([
      recordReminderActivity({ event: 'armed', reminderId: 'a' }),
      recordReminderActivity({ event: 'fired', reminderId: 'b' }),
      recordReminderActivity({ event: 'reconciled', reminderId: 'c' }),
    ]);

    expect((await readLog()).map((e) => e.reminderId)).toEqual(['a', 'b', 'c']);
  });

  it('swallows a lock that cannot be taken', async () => {
    vi.spyOn(navigator.locks, 'request').mockRejectedValueOnce(new Error('aborted'));
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(
      recordReminderActivity({ event: 'fired', reminderId: 'r1' })
    ).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledWith(
      'Could not record reminder activity',
      expect.any(Error),
      expect.anything()
    );
  });
});

describe('activitySubject', () => {
  it('carries the id and a short form of the text', () => {
    const reminder = reminderFactory.build({ id: 'r1', text: 'x'.repeat(60) });

    expect(activitySubject(reminder)).toEqual({ reminderId: 'r1', text: 'x'.repeat(40) });
  });
});
