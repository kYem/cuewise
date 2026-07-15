import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageKeyValueStore } from './local-storage-key-value-store';

const store = new LocalStorageKeyValueStore();

describe('LocalStorageKeyValueStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sets and gets a JSON value', async () => {
    await store.set('token', 'abc', 'local');

    await expect(store.get<string>('token', 'local')).resolves.toBe('abc');
  });

  it('returns null for a missing key', async () => {
    await expect(store.get('missing', 'local')).resolves.toBeNull();
  });

  it('removes a key', async () => {
    await store.set('temp', 1, 'local');

    await store.remove('temp', 'local');

    await expect(store.get('temp', 'local')).resolves.toBeNull();
  });

  it('estimates usage against a 5MB quota', async () => {
    localStorage.setItem('k', 'v');

    await expect(store.getUsage('local')).resolves.toEqual({ bytesInUse: 2, quota: 5242880 });
  });

  describe('write failure classification', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('classifies a QuotaExceededError as quota_exceeded with key and area', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('the quota has been exceeded', 'QuotaExceededError');
      });

      const result = await store.set('goals', ['data'], 'local');

      expect(result).toEqual({
        success: false,
        error: {
          type: 'quota_exceeded',
          message: 'Storage is full — could not save goals. Clear some data to continue.',
          key: 'goals',
          area: 'local',
        },
      });
    });

    it('keeps non-quota write failures as unknown', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('security error');
      });

      const result = await store.set('goals', ['data'], 'local');

      expect(result).toMatchObject({ success: false, error: { type: 'unknown' } });
    });
  });
});
