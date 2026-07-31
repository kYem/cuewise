import { configurePlatform, resetPlatform } from '@cuewise/shared';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeObservableStore } from './__fixtures__/storage-changes.fixtures';
import { usePomodoroStorageSync, usePomodoroStore } from './pomodoro-store';

describe('usePomodoroStorageSync', () => {
  afterEach(() => {
    resetPlatform();
  });

  it('rehydrates when another context writes the timer state', () => {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const rehydrate = vi.spyOn(usePomodoroStore.persist, 'rehydrate').mockImplementation(() => {});
    renderHook(() => usePomodoroStorageSync());

    fake.emit(['pomodoroState']);

    expect(rehydrate).toHaveBeenCalledTimes(1);
    rehydrate.mockRestore();
  });

  it('ignores another key, and the same key in another area', () => {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const rehydrate = vi.spyOn(usePomodoroStore.persist, 'rehydrate').mockImplementation(() => {});
    renderHook(() => usePomodoroStorageSync());

    fake.emit(['soundsState']);
    fake.emit(['pomodoroState'], 'sync');

    expect(rehydrate).not.toHaveBeenCalled();
    rehydrate.mockRestore();
  });

  it('stops observing when the component unmounts', () => {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });

    const { unmount } = renderHook(() => usePomodoroStorageSync());
    expect(fake.subscriberCount).toBe(1);
    unmount();

    expect(fake.subscriberCount).toBe(0);
  });

  it('mounts without a storage backend rather than crashing the tree', () => {
    // Reset here, not inherited from a neighbour's afterEach: run alone this test would otherwise
    // meet the self-registered backend and never reach the guard it names.
    resetPlatform();

    expect(() => renderHook(() => usePomodoroStorageSync())).not.toThrow();
  });
});
