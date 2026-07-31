import { logger, type StorageArea, toStoredValues, UNREADABLE_VALUE } from '@cuewise/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageKeyValueStore } from './local-storage-key-value-store';

const store = new LocalStorageKeyValueStore();

describe('LocalStorageKeyValueStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    expect(result).toEqual(toStoredValues({ a: 1, c: 3 }));
    expect(Object.keys(result ?? {})).not.toContain('b');
  });

  // Absence is the semantic the sparse settings layout rests on, and both shipped adapters must
  // agree on it: a key stored as `null` was written, so it is present, not "never set".
  it('getMany reports a key stored as null as present', async () => {
    const store = new LocalStorageKeyValueStore();
    await store.set('nulled', null, 'local');

    const result = await store.getMany(['nulled', 'missing'], 'local');

    expect(result).toEqual(toStoredValues({ nulled: null }));
    expect(Object.keys(result ?? {})).toEqual(['nulled']);
  });

  // One bad value costs its own key, never the batch: the settings layer defaults that field
  // and keeps the rest, where a null batch would reset every preference on this device.
  it('getMany keeps the readable keys when one value will not parse', async () => {
    const store = new LocalStorageKeyValueStore();
    await store.set('a', 1, 'local');
    localStorage.setItem('corrupt', '{not json');
    await store.set('c', 3, 'local');
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const result = await store.getMany(['a', 'corrupt', 'c'], 'local');

    expect(result).toEqual({ ...toStoredValues({ a: 1, c: 3 }), corrupt: UNREADABLE_VALUE });
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('corrupt'), expect.anything());
  });

  // Absence means "never written" to the settings layer, and a raw list read turns it into `[]`
  // that sync would seal as a tombstone — so a value that is there but unreadable is neither.
  it('getMany reports an unreadable value as its own arm, not as absent', async () => {
    const store = new LocalStorageKeyValueStore();
    localStorage.setItem('corrupt', '{not json');
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    const result = await store.getMany(['corrupt', 'missing'], 'local');

    expect(result?.corrupt).toEqual({ readable: false });
    expect(result?.missing).toBeUndefined();
  });

  // A storage that will not answer at all (SecurityError on a locked-down origin) is a failed
  // read, and only that fails the batch — the settings layer must not read it as "never written".
  it('getMany reports a batch it could not read as null', async () => {
    const store = new LocalStorageKeyValueStore();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(store.getMany(['a'], 'local')).resolves.toBeNull();
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

// JSON.stringify(undefined) is undefined, which localStorage keeps as the string "undefined" —
// unparseable for every later read, and reported to the caller as a successful write.
describe('LocalStorageKeyValueStore.set with no value', () => {
  it('refuses it instead of poisoning the key', async () => {
    const store = new LocalStorageKeyValueStore();
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    const result = await store.set('poisoned', undefined, 'local');

    expect(result.success).toBe(false);
    expect(localStorage.getItem('poisoned')).toBeNull();
  });
});

describe('LocalStorageKeyValueStore.onChanged', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports its own writes, since window.onstorage never fires for the writer', async () => {
    const store = new LocalStorageKeyValueStore();
    const seen: { keys: string[]; area: StorageArea }[] = [];
    store.onChanged((keys, area) => seen.push({ keys, area }));

    await store.set('settings.theme', 'dark', 'local');

    expect(seen).toEqual([{ keys: ['settings.theme'], area: 'local' }]);
  });

  it('reports a batch once, not once per key', async () => {
    const store = new LocalStorageKeyValueStore();
    const seen: string[][] = [];
    store.onChanged((keys) => seen.push(keys));

    await store.setMany({ 'settings.theme': 'dark', 'settings.showClock': true }, 'local');

    expect(seen).toEqual([['settings.theme', 'settings.showClock']]);
  });

  it('reports what a partial batch did land, not nothing', async () => {
    const store = new LocalStorageKeyValueStore();
    const seen: string[][] = [];
    store.onChanged((keys) => seen.push(keys));

    // The second entry refuses: `undefined` is the value the adapter rejects outright.
    await store.setMany({ 'settings.theme': 'dark', 'settings.showClock': undefined }, 'local');

    expect(seen).toEqual([['settings.theme']]);
  });

  it('loses no key when two batches overlap', async () => {
    // A second batch replacing the collector drops whatever the first had gathered.
    const store = new LocalStorageKeyValueStore();
    const seen: string[][] = [];
    store.onChanged((keys) => seen.push(keys));

    await Promise.all([
      store.setMany({ a: 1, b: 2 }, 'local'),
      store.setMany({ c: 3, d: 4 }, 'local'),
    ]);

    // One notification, not one per batch: coalescing is the whole point of batching, and each
    // costs every subscriber a full re-read.
    expect(seen).toHaveLength(1);
    expect(seen.flat().sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps an overlapping batch’s areas apart, so an area filter cannot drop the wrong keys', async () => {
    const store = new LocalStorageKeyValueStore();
    const seen: { keys: string[]; area: StorageArea }[] = [];
    store.onChanged((keys, area) => seen.push({ keys, area }));

    await Promise.all([store.setMany({ a: 1 }, 'local'), store.setMany({ b: 2 }, 'sync')]);

    expect(seen).toContainEqual({ keys: ['a'], area: 'local' });
    expect(seen).toContainEqual({ keys: ['b'], area: 'sync' });
  });

  it('stops reporting once unsubscribed', async () => {
    const store = new LocalStorageKeyValueStore();
    const seen: string[][] = [];
    const unsubscribe = store.onChanged((keys) => seen.push(keys));

    unsubscribe();
    await store.set('settings.theme', 'dark', 'local');

    expect(seen).toEqual([]);
  });

  it('keeps notifying the rest when one subscriber throws', async () => {
    const store = new LocalStorageKeyValueStore();
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const seen: string[][] = [];
    store.onChanged(() => {
      throw new Error('subscriber exploded');
    });
    store.onChanged((keys) => seen.push(keys));

    await expect(store.set('settings.theme', 'dark', 'local')).resolves.toEqual({ success: true });

    expect(seen).toEqual([['settings.theme']]);
    expect(errorSpy).toHaveBeenCalledWith('A storage change subscriber threw', expect.anything());
    errorSpy.mockRestore();
  });
});
