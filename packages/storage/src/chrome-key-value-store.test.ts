import { logger, toStoredValues } from '@cuewise/shared';
import type { MockChromeStorage } from '@cuewise/test-utils/mocks';
import { describe, expect, it, vi } from 'vitest';
import { ChromeKeyValueStore } from './chrome-key-value-store';

const store = new ChromeKeyValueStore();

describe('ChromeKeyValueStore with chrome.storage available', () => {
  it('get returns the stored value for the area', async () => {
    const local = global.chrome.storage.local as unknown as MockChromeStorage;
    local.data.greeting = 'hi';

    await expect(store.get<string>('greeting', 'local')).resolves.toBe('hi');
  });

  it('get returns null for a missing key', async () => {
    await expect(store.get('missing', 'local')).resolves.toBeNull();
  });

  it('set writes the value and reports success', async () => {
    const local = global.chrome.storage.local as unknown as MockChromeStorage;

    const result = await store.set('count', 3, 'local');

    expect(result).toEqual({ success: true });
    expect(local.data.count).toBe(3);
  });

  it('remove deletes the key', async () => {
    const local = global.chrome.storage.local as unknown as MockChromeStorage;
    local.data.temp = 'x';

    await expect(store.remove('temp', 'local')).resolves.toBe(true);
    expect(local.data.temp).toBeUndefined();
  });

  it('set maps a sync quota rejection to a quota_exceeded StorageResult', async () => {
    const sync = global.chrome.storage.sync as unknown as MockChromeStorage;
    sync.set.mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));

    const result = await store.set('big', 'data', 'sync');

    expect(result).toMatchObject({
      success: false,
      error: { type: 'quota_exceeded', area: 'sync' },
    });
  });

  it('maps a sync per-item quota rejection to per_item_quota_exceeded', async () => {
    const sync = global.chrome.storage.sync as unknown as MockChromeStorage;
    sync.set.mockRejectedValueOnce(new Error('QUOTA_BYTES_PER_ITEM quota exceeded'));

    const result = await store.set('big', 'data', 'sync');

    expect(result).toMatchObject({ success: false, error: { type: 'per_item_quota_exceeded' } });
  });

  it('maps a local quota rejection to quota_exceeded for the local area', async () => {
    const local = global.chrome.storage.local as unknown as MockChromeStorage;
    local.set.mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));

    const result = await store.set('big', 'data', 'local');

    expect(result).toMatchObject({
      success: false,
      error: { type: 'quota_exceeded', area: 'local' },
    });
  });

  it('maps a non-quota rejection to an unknown StorageError', async () => {
    const local = global.chrome.storage.local as unknown as MockChromeStorage;
    local.set.mockRejectedValueOnce(new Error('serialization failed'));

    const result = await store.set('k', 'v', 'local');

    expect(result).toMatchObject({ success: false, error: { type: 'unknown' } });
  });

  it('getUsage returns chrome bytes in use and the local quota', async () => {
    (
      global.chrome.storage.local as unknown as { getBytesInUse: () => Promise<number> }
    ).getBytesInUse = () => Promise.resolve(2048);

    await expect(store.getUsage('local')).resolves.toEqual({
      bytesInUse: 2048,
      quota: 10485760,
    });
  });

  it('getUsage returns the 100KB sync quota for the sync area', async () => {
    (
      global.chrome.storage.sync as unknown as { getBytesInUse: () => Promise<number> }
    ).getBytesInUse = () => Promise.resolve(512);

    await expect(store.getUsage('sync')).resolves.toEqual({
      bytesInUse: 512,
      quota: 102400,
    });
  });

  it('getMany returns only the keys that are present', async () => {
    const local = global.chrome.storage.local as unknown as MockChromeStorage;
    local.data.a = 1;
    local.data.c = 3;

    const result = await store.getMany(['a', 'b', 'c'], 'local');

    expect(result).toEqual(toStoredValues({ a: 1, c: 3 }));
    expect(Object.keys(result ?? {})).not.toContain('b');
  });

  // The counterpart of the localStorage adapter's own case: "absent" is what the sparse settings
  // layout reads as "follow the default", so the two backends must not disagree about a null.
  it('getMany reports a key stored as null as present', async () => {
    const local = global.chrome.storage.local as unknown as MockChromeStorage;
    local.data.nulled = null;

    const result = await store.getMany(['nulled', 'missing'], 'local');

    expect(result).toEqual(toStoredValues({ nulled: null }));
    expect(Object.keys(result ?? {})).toEqual(['nulled']);
  });

  // Absence means "never written" to the settings layer, so a read that failed must not pose
  // as one — `syncEnabled` reading absent routes a sync user's whole dataset to the wrong area.
  it('getMany reports a failed read as null rather than as an empty result', async () => {
    const local = global.chrome.storage.local as unknown as MockChromeStorage;
    local.get.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(store.getMany(['a'], 'local')).resolves.toBeNull();
  });

  // A batch read backs every settings read and the area routing itself, so the one log line
  // it leaves has to say which keys and which area — otherwise the failure is untraceable.
  it('getMany names the keys and the area it could not read', async () => {
    const local = global.chrome.storage.local as unknown as MockChromeStorage;
    local.get.mockRejectedValueOnce(new Error('storage unavailable'));
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await store.getMany(['settings.theme'], 'local');

    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('local'),
      expect.objectContaining({ keys: ['settings.theme'] })
    );
    logged.mockRestore();
  });

  it('setMany writes every entry in one call', async () => {
    const local = global.chrome.storage.local as unknown as MockChromeStorage;

    const result = await store.setMany({ a: 1, b: 2 }, 'local');

    expect(result).toEqual({ success: true });
    expect(local.data.a).toBe(1);
    expect(local.data.b).toBe(2);
  });

  it('removeMany deletes every named key and leaves others', async () => {
    const local = global.chrome.storage.local as unknown as MockChromeStorage;
    local.data.a = 1;
    local.data.b = 2;
    local.data.c = 3;

    await store.removeMany(['a', 'c'], 'local');

    expect(local.data.a).toBeUndefined();
    expect(local.data.b).toBe(2);
    expect(local.data.c).toBeUndefined();
  });

  it('setMany maps a sync quota rejection to a quota_exceeded StorageResult with no key', async () => {
    const sync = global.chrome.storage.sync as unknown as MockChromeStorage;
    sync.set.mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));

    const result = await store.setMany({ big: 'data' }, 'sync');

    expect(result).toMatchObject({
      success: false,
      error: { type: 'quota_exceeded', area: 'sync', key: undefined },
    });
  });
});
