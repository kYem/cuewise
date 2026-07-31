import { configurePlatform, resetPlatform } from '@cuewise/shared';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeObservableStore } from './__fixtures__/storage-changes.fixtures';
import { useSoundsStorageSync, useSoundsStore } from './sounds-store';

describe('useSoundsStorageSync', () => {
  afterEach(() => {
    resetPlatform();
    useSoundsStore.setState({ isLeader: false });
    vi.useRealTimers();
  });

  it('rehydrates when another context writes the sounds state', () => {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const rehydrate = vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);

    expect(rehydrate).toHaveBeenCalledTimes(1);
    rehydrate.mockRestore();
  });

  it('ignores another key, and the same key in another area', () => {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const rehydrate = vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    renderHook(() => useSoundsStorageSync());

    fake.emit(['pomodoroState']);
    fake.emit(['soundsState'], 'sync');

    expect(rehydrate).not.toHaveBeenCalled();
    rehydrate.mockRestore();
  });

  it('leaves playback alone in a tab that is not the leader', () => {
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const rehydrate = vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);

    expect(vi.getTimerCount()).toBe(0);
    rehydrate.mockRestore();
  });

  it('schedules the leader playback sync in the tab that is the leader', () => {
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const rehydrate = vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    useSoundsStore.setState({ isLeader: true });
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);

    expect(vi.getTimerCount()).toBe(1);
    rehydrate.mockRestore();
  });

  it('re-subscribes with the new role when leadership changes', () => {
    // A tab that becomes leader after mount keeps a closure holding isLeader false, and silently
    // stops scheduling the handoff. A dropped teardown leaks a subscriber per flip instead.
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const rehydrate = vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    const { rerender } = renderHook(() => useSoundsStorageSync());
    expect(fake.subscriberCount).toBe(1);

    useSoundsStore.setState({ isLeader: true });
    rerender();
    fake.emit(['soundsState']);

    expect(fake.subscriberCount).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
    rehydrate.mockRestore();
  });

  it('stops observing when the component unmounts', () => {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });

    const { unmount } = renderHook(() => useSoundsStorageSync());
    unmount();

    expect(fake.subscriberCount).toBe(0);
  });

  it('mounts without a storage backend rather than crashing the tree', () => {
    resetPlatform();

    expect(() => renderHook(() => useSoundsStorageSync())).not.toThrow();
  });
});
