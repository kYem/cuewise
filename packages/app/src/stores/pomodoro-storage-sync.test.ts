import {
  configurePlatform,
  type KeyValueStore,
  resetPlatform,
  type StorageArea,
} from '@cuewise/shared';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePomodoroStorageSync, usePomodoroStore } from './pomodoro-store';

function fakeStore() {
  const subscribers = new Set<(keys: string[], area: StorageArea) => void>();
  return {
    store: {
      onChanged(handler: (keys: string[], area: StorageArea) => void) {
        subscribers.add(handler);
        return () => subscribers.delete(handler);
      },
    } as unknown as KeyValueStore,
    emit(keys: string[], area: StorageArea = 'local') {
      for (const subscriber of subscribers) {
        subscriber(keys, area);
      }
    },
    get subscriberCount() {
      return subscribers.size;
    },
  };
}

describe('usePomodoroStorageSync', () => {
  afterEach(() => {
    resetPlatform();
  });

  it('rehydrates when another context writes the timer state', () => {
    const fake = fakeStore();
    configurePlatform({ storage: fake.store });
    const rehydrate = vi.spyOn(usePomodoroStore.persist, 'rehydrate').mockImplementation(() => {});
    renderHook(() => usePomodoroStorageSync());

    fake.emit(['pomodoroState']);

    expect(rehydrate).toHaveBeenCalledTimes(1);
    rehydrate.mockRestore();
  });

  it('ignores another key, and the same key in another area', () => {
    const fake = fakeStore();
    configurePlatform({ storage: fake.store });
    const rehydrate = vi.spyOn(usePomodoroStore.persist, 'rehydrate').mockImplementation(() => {});
    renderHook(() => usePomodoroStorageSync());

    fake.emit(['soundsState']);
    fake.emit(['pomodoroState'], 'sync');

    expect(rehydrate).not.toHaveBeenCalled();
    rehydrate.mockRestore();
  });

  it('stops observing when the component unmounts', () => {
    const fake = fakeStore();
    configurePlatform({ storage: fake.store });

    const { unmount } = renderHook(() => usePomodoroStorageSync());
    expect(fake.subscriberCount).toBe(1);
    unmount();

    expect(fake.subscriberCount).toBe(0);
  });

  it('mounts without a storage backend rather than crashing the tree', () => {
    // getStorage() throws when unconfigured, and this runs inside a useEffect.
    expect(() => renderHook(() => usePomodoroStorageSync())).not.toThrow();
  });
});
