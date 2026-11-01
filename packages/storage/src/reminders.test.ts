import { configurePlatform } from '@cuewise/shared';
import { reminderFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageKeyValueStore } from './local-storage-key-value-store';
import { getReminders, setReminders, updateReminders } from './reminders';
import { resetSettingsMigration } from './settings';

// The migration memo lives at module scope, so an earlier test's run would satisfy a later one.
beforeEach(() => {
  vi.restoreAllMocks();
  resetSettingsMigration();
});

describe('updateReminders', () => {
  // The service worker writes this array from a notification handler while the page writes it
  // from the panel, so without the lock whoever lands second erases the other's entry.
  it('lets two concurrent writers both land', async () => {
    configurePlatform({ storage: new LocalStorageKeyValueStore() });
    const [first, second] = reminderFactory.buildList(2);
    await setReminders([]);

    await Promise.all([
      updateReminders((reminders) => [...reminders, first]),
      updateReminders((reminders) => [...reminders, second]),
    ]);

    const stored = await getReminders();
    expect(stored.map((reminder) => reminder.id).sort()).toEqual([first.id, second.id].sort());
  });
});
