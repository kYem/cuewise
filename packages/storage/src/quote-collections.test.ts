import { configurePlatform } from '@cuewise/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageKeyValueStore } from './local-storage-key-value-store';
import { getCollections, setCollections, updateCollections } from './quote-collections';
import { resetSettingsMigration } from './settings';

// The migration memo lives at module scope, so an earlier test's run would satisfy a later one.
beforeEach(() => {
  vi.restoreAllMocks();
  resetSettingsMigration();
});

describe('updateCollections', () => {
  it('lets two concurrent writers both land', async () => {
    configurePlatform({ storage: new LocalStorageKeyValueStore() });
    const first = { id: 'c1', name: 'One', createdAt: new Date().toISOString() };
    const second = { id: 'c2', name: 'Two', createdAt: new Date().toISOString() };
    await setCollections([]);

    await Promise.all([
      updateCollections((current) => [...current, first]),
      updateCollections((current) => [...current, second]),
    ]);

    const stored = await getCollections();
    expect(stored.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
  });
});
