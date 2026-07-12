import { configurePlatform, type KeyValueStore, type StorageUsage } from '@cuewise/shared';
import { describe, expect, it } from 'vitest';
import { getStorageUsage } from './storage-helpers';

// Fake store: no settings stored (→ syncEnabled false → 'local' area), fixed usage.
function fakeStore(usage: StorageUsage): KeyValueStore {
  return {
    supportsSync: true,
    get: async () => null,
    set: async () => ({ success: true }),
    remove: async () => true,
    getUsage: async () => usage,
  };
}

describe('getStorageUsage', () => {
  it('computes percentage and flags a warning above 75%', async () => {
    configurePlatform({ storage: fakeStore({ bytesInUse: 8_000_000, quota: 10_000_000 }) });

    const info = await getStorageUsage();

    expect(info.percentageUsed).toBe(80);
    expect(info.isWarning).toBe(true);
    expect(info.isCritical).toBe(false);
  });

  it('flags critical above 90%', async () => {
    configurePlatform({ storage: fakeStore({ bytesInUse: 9_500_000, quota: 10_000_000 }) });

    const info = await getStorageUsage();

    expect(info.isCritical).toBe(true);
  });
});
