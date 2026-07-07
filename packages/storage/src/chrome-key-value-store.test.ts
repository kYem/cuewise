import type { MockChromeStorage } from '@cuewise/test-utils/mocks';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('quota_exceeded');
    expect(result.error?.area).toBe('sync');
  });

  it('getUsage returns chrome bytes in use and the local quota', async () => {
    (global.chrome.storage.local as unknown as { getBytesInUse: unknown }).getBytesInUse = (
      _keys: unknown,
      cb: (bytes: number) => void
    ) => cb(2048);

    await expect(store.getUsage('local')).resolves.toEqual({
      bytesInUse: 2048,
      quota: 10485760,
    });
  });
});

describe('ChromeKeyValueStore without chrome.storage (dev fallback)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('get falls back to localStorage', async () => {
    vi.stubGlobal('chrome', undefined);
    localStorage.setItem('token', JSON.stringify('abc'));

    await expect(store.get<string>('token', 'local')).resolves.toBe('abc');
  });

  it('getUsage estimates localStorage size against a 5MB quota', async () => {
    vi.stubGlobal('chrome', undefined);
    localStorage.clear();
    localStorage.setItem('k', 'v');

    const usage = await store.getUsage('local');

    expect(usage.bytesInUse).toBe(2); // 'k'.length + 'v'.length
    expect(usage.quota).toBe(5242880);
  });
});
