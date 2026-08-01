import { configurePlatform, resetPlatform } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { youtubePlayer } from '../services/youtube-player';
import { fakeObservableStore } from './__fixtures__/storage-changes.fixtures';
import { useSoundsStorageSync, useSoundsStore } from './sounds-store';

const toastError = vi.fn();
vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({ error: toastError, warning: vi.fn(), success: vi.fn() }),
  },
}));

describe('useSoundsStorageSync', () => {
  afterEach(() => {
    resetPlatform();
    useSoundsStore.setState({ isLeader: false });
    vi.useRealTimers();
    // restoreMocks restores spies, not a bare vi.fn() — without this its call history accumulates
    // and a toHaveBeenCalledWith is satisfied by whatever an earlier test toasted.
    toastError.mockClear();
  });

  it('rehydrates when another context writes the sounds state', () => {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const rehydrate = vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);

    expect(rehydrate).toHaveBeenCalledTimes(1);
  });

  it('ignores another key, and the same key in another area', () => {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const rehydrate = vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    renderHook(() => useSoundsStorageSync());

    fake.emit(['pomodoroState']);
    fake.emit(['soundsState'], 'sync');

    expect(rehydrate).not.toHaveBeenCalled();
  });

  it('leaves playback alone in a tab that is not the leader', () => {
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    const rehydrate = vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);

    // Asserted alongside the timer count, so "not the leader" cannot pass as "never subscribed".
    expect(rehydrate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drops a handoff scheduled just before the tab stopped being the leader', () => {
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    useSoundsStore.setState({ isLeader: true });
    const { rerender } = renderHook(() => useSoundsStorageSync());
    fake.emit(['soundsState']);
    expect(vi.getTimerCount()).toBe(1);

    useSoundsStore.setState({ isLeader: false });
    rerender();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps one pending handoff across a burst, not one per key', () => {
    // A pull writes a burst, and overlapping handoffs each call loadPlaylist against the others.
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    useSoundsStore.setState({ isLeader: true });
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);
    fake.emit(['soundsState']);

    expect(vi.getTimerCount()).toBe(1);
  });

  it('schedules the leader playback sync in the tab that is the leader', () => {
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    useSoundsStore.setState({ isLeader: true });
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);

    expect(vi.getTimerCount()).toBe(1);
  });

  it('re-subscribes with the new role when leadership changes', () => {
    // A tab that becomes leader after mount keeps a closure holding isLeader false, and silently
    // stops scheduling the handoff. A dropped teardown leaks a subscriber per flip instead.
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    const { rerender } = renderHook(() => useSoundsStorageSync());
    expect(fake.subscriberCount).toBe(1);

    useSoundsStore.setState({ isLeader: true });
    rerender();
    fake.emit(['soundsState']);

    expect(fake.subscriberCount).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
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

  it('stops claiming playback when the leader cannot load the playlist', async () => {
    // The load callback is what starts the audio, so without it the panel would render its
    // "playing" indicator over silence.
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    vi.spyOn(youtubePlayer, 'getCurrentPlaylistId').mockReturnValue('another-playlist');
    vi.spyOn(youtubePlayer, 'loadPlaylist').mockImplementation(() => {
      throw new Error('the iframe API is not ready');
    });
    vi.spyOn(storage, 'getCurrentVideoForPlaylist').mockResolvedValue(null);
    useSoundsStore.setState({
      isLeader: true,
      activeSource: 'youtube',
      isPlaying: true,
      isYoutubeLoading: false,
      selectedPlaylistId: 'p1',
      playlists: [
        { id: 'p1', name: 'Focus', playlistId: 'PL1', firstVideoId: 'v1', isCustom: false },
      ],
    });
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);
    await vi.waitFor(() => expect(useSoundsStore.getState().isPlaying).toBe(false));

    expect(useSoundsStore.getState().isYoutubeLoading).toBe(false);
    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining('Could not start the playlist')
    );
  });
});
