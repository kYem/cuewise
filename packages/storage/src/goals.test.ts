import { configurePlatform } from '@cuewise/shared';
import { goalFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGoals, setGoals, updateGoals } from './goals';
import { LocalStorageKeyValueStore } from './local-storage-key-value-store';
import { resetSettingsMigration } from './settings';

// The migration memo lives at module scope, so an earlier test's run would satisfy a later one.
beforeEach(() => {
  vi.restoreAllMocks();
  resetSettingsMigration();
});

describe('updateGoals', () => {
  // The page and the service worker both read the goal array, mutate it, and write it back, so
  // without the lock whoever lands second erases the other's entry.
  it('lets two concurrent writers both land', async () => {
    configurePlatform({ storage: new LocalStorageKeyValueStore() });
    const [first, second] = goalFactory.buildList(2);
    await setGoals([]);

    await Promise.all([
      updateGoals((goals) => [...goals, first]),
      updateGoals((goals) => [...goals, second]),
    ]);

    const stored = await getGoals();
    expect(stored.map((goal) => goal.id).sort()).toEqual([first.id, second.id].sort());
  });

  it('mutates the stored list, never one the caller supplied', async () => {
    configurePlatform({ storage: new LocalStorageKeyValueStore() });
    const existing = goalFactory.build();
    await setGoals([existing]);

    const { goals } = await updateGoals((current) => current);

    expect(goals.map((goal) => goal.id)).toEqual([existing.id]);
  });
});
