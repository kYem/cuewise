import { beforeEach, describe, expect, it } from 'vitest';
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
});
