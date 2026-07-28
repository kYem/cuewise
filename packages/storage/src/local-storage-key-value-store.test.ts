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

  it('getMany returns only the keys that are present', async () => {
    const store = new LocalStorageKeyValueStore();
    await store.set('a', 1, 'local');
    await store.set('c', 3, 'local');

    const result = await store.getMany(['a', 'b', 'c'], 'local');

    expect(result).toEqual({ a: 1, c: 3 });
    expect('b' in result).toBe(false);
  });

  // Absence is the semantic the sparse settings layout rests on, and both shipped adapters must
  // agree on it: a key stored as `null` was written, so it is present, not "never set".
  it('getMany reports a key stored as null as present', async () => {
    const store = new LocalStorageKeyValueStore();
    await store.set('nulled', null, 'local');

    const result = await store.getMany(['nulled', 'missing'], 'local');

    expect(result).toEqual({ nulled: null });
    expect('nulled' in result).toBe(true);
    expect('missing' in result).toBe(false);
  });

  it('setMany writes every entry in one call', async () => {
    const store = new LocalStorageKeyValueStore();

    const result = await store.setMany({ a: 1, b: 2 }, 'local');

    expect(result).toEqual({ success: true });
    expect(await store.get('a', 'local')).toBe(1);
    expect(await store.get('b', 'local')).toBe(2);
  });

  it('removeMany deletes every named key and leaves others', async () => {
    const store = new LocalStorageKeyValueStore();
    await store.setMany({ a: 1, b: 2, c: 3 }, 'local');

    await store.removeMany(['a', 'c'], 'local');

    expect(await store.get('a', 'local')).toBeNull();
    expect(await store.get('b', 'local')).toBe(2);
    expect(await store.get('c', 'local')).toBeNull();
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
