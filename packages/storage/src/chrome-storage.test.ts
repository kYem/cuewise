import { configurePlatform, type KeyValueStore } from '@cuewise/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFromStorage, removeFromStorage, setInStorage } from './chrome-storage';

// The delegators just forward to the configured KeyValueStore; backend behavior
// is covered by chrome-key-value-store.test / local-storage-key-value-store.test.
const fakeStore = {
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  getUsage: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  configurePlatform({ storage: fakeStore as unknown as KeyValueStore });
});

describe('storage delegators', () => {
  it('getFromStorage forwards key + area to the store', async () => {
    fakeStore.get.mockResolvedValue('value');

    await expect(getFromStorage('greeting', 'local')).resolves.toBe('value');
    expect(fakeStore.get).toHaveBeenCalledWith('greeting', 'local');
  });

  it('setInStorage forwards key, value + area to the store', async () => {
    fakeStore.set.mockResolvedValue({ success: true });

    await setInStorage('count', 3, 'sync');

    expect(fakeStore.set).toHaveBeenCalledWith('count', 3, 'sync');
  });

  it('removeFromStorage forwards the key (defaulting to local) to the store', async () => {
    fakeStore.remove.mockResolvedValue(true);

    await expect(removeFromStorage('greeting')).resolves.toBe(true);
    expect(fakeStore.remove).toHaveBeenCalledWith('greeting', 'local');
  });
});
