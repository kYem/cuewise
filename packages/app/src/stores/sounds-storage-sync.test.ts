import { configurePlatform, resetPlatform } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { youtubePlayer } from '../services/youtube-player';
import { ambientSoundPlayer } from '../utils/ambient-sounds';
import {
  leaderPlayingYoutube,
  leaderPlaylist,
  stubYoutubePlayer,
} from './__fixtures__/sounds-store.fixtures';
import { echoWritesTo, fakeObservableStore } from './__fixtures__/storage-changes.fixtures';
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
    useSoundsStore.setState(useSoundsStore.getInitialState());
    vi.useRealTimers();
    // restoreMocks does not reach a bare vi.fn().
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
    stubYoutubePlayer();
    const loadPlaylist = vi.spyOn(youtubePlayer, 'loadPlaylist').mockImplementation(() => {
      throw new Error('the iframe API is not ready');
    });
    vi.spyOn(storage, 'getCurrentVideoForPlaylist').mockResolvedValue(null);
    leaderPlayingYoutube();
    useSoundsStore.setState({ isYoutubeLoading: false });
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);
    await vi.waitFor(() => expect(useSoundsStore.getState().isPlaying).toBe(false));

    expect(useSoundsStore.getState().isYoutubeLoading).toBe(false);
    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining('Could not start the playlist')
    );
    expect(loadPlaylist).toHaveBeenCalled();
  });

  it('starts the audio the leader was told about by another tab', async () => {
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    const player = stubYoutubePlayer();
    vi.spyOn(storage, 'getCurrentVideoForPlaylist').mockResolvedValue(null);
    leaderPlayingYoutube();
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);
    await vi.advanceTimersByTimeAsync(50);

    expect(player.loadPlaylist).toHaveBeenCalledWith(
      leaderPlaylist.playlistId,
      leaderPlaylist.firstVideoId,
      expect.any(Function),
      0
    );
  });

  it('resumes a playlist the leader already has loaded instead of loading it again', async () => {
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    const player = stubYoutubePlayer({ loaded: leaderPlaylist.playlistId, playing: false });
    leaderPlayingYoutube();
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);
    await vi.advanceTimersByTimeAsync(50);

    expect(player.play).toHaveBeenCalled();
    expect(player.loadPlaylist).not.toHaveBeenCalled();
  });

  it('starts the audio once the load the leader began lands', async () => {
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    const player = stubYoutubePlayer();
    vi.spyOn(storage, 'getCurrentVideoForPlaylist').mockResolvedValue(null);
    const setVolume = vi.spyOn(youtubePlayer, 'setVolume').mockImplementation(() => {});
    leaderPlayingYoutube();
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);
    await vi.advanceTimersByTimeAsync(50);
    const onReady = player.loadPlaylist.mock.calls[0][2];
    onReady?.();

    expect(player.play).toHaveBeenCalled();
    expect(setVolume).toHaveBeenCalledWith(useSoundsStore.getState().youtubeVolume);
    expect(useSoundsStore.getState().isYoutubeLoading).toBe(false);
  });

  it('stops the audio when another tab stops it', async () => {
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    const player = stubYoutubePlayer({ loaded: leaderPlaylist.playlistId, playing: true });
    leaderPlayingYoutube();
    useSoundsStore.setState({ isPlaying: false, isPaused: false });
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);
    await vi.advanceTimersByTimeAsync(50);

    expect(player.stop).toHaveBeenCalled();
  });

  it('pauses rather than unloading when another tab pauses', async () => {
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    const player = stubYoutubePlayer({ loaded: leaderPlaylist.playlistId, playing: true });
    leaderPlayingYoutube();
    useSoundsStore.setState({ isPlaying: false, isPaused: true });
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);
    await vi.advanceTimersByTimeAsync(50);

    expect(player.pause).toHaveBeenCalled();
    expect(player.stop).not.toHaveBeenCalled();
  });

  it('resumes from the remembered timestamp rather than the top of the playlist', async () => {
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    const player = stubYoutubePlayer();
    vi.spyOn(storage, 'getCurrentVideoForPlaylist').mockResolvedValue({
      videoId: 'half-watched',
      timestamp: 137,
    });
    leaderPlayingYoutube();
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);
    await vi.advanceTimersByTimeAsync(50);

    expect(player.loadPlaylist).toHaveBeenCalledWith(
      leaderPlaylist.playlistId,
      'half-watched',
      expect.any(Function),
      137
    );
  });

  it('loads once while the player has yet to report the playlist it is loading', async () => {
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    const player = stubYoutubePlayer();
    vi.spyOn(storage, 'getCurrentVideoForPlaylist').mockResolvedValue(null);
    leaderPlayingYoutube();
    renderHook(() => useSoundsStorageSync());
    const stopEcho = echoWritesTo(useSoundsStore, fake, 'soundsState');

    fake.emit(['soundsState']);
    await vi.advanceTimersByTimeAsync(50);
    fake.emit(['soundsState']);
    await vi.advanceTimersByTimeAsync(500);
    stopEcho();

    expect(player.loadPlaylist).toHaveBeenCalledTimes(1);
  });

  it('leaves ambient playback to the tab that started it', async () => {
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    const playAmbient = vi.spyOn(ambientSoundPlayer, 'play').mockImplementation(() => {});
    const stopAmbient = vi.spyOn(ambientSoundPlayer, 'stop').mockImplementation(() => {});
    const player = stubYoutubePlayer();
    useSoundsStore.setState({
      isLeader: true,
      activeSource: 'ambient',
      selectedAmbientSound: 'rain',
      isPlaying: true,
    });
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);
    await vi.advanceTimersByTimeAsync(50);

    expect(playAmbient).not.toHaveBeenCalled();
    expect(stopAmbient).not.toHaveBeenCalled();
    expect(player.stop).toHaveBeenCalled();
  });

  it('silences its own ambient when another tab switches to youtube', async () => {
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    const stopAmbient = vi.spyOn(ambientSoundPlayer, 'stop').mockImplementation(() => {});
    stubYoutubePlayer({ loaded: leaderPlaylist.playlistId, playing: true });
    leaderPlayingYoutube();
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);
    await vi.advanceTimersByTimeAsync(50);

    expect(stopAmbient).toHaveBeenCalled();
  });

  it('silences its own ambient when another tab stops it', async () => {
    vi.useFakeTimers();
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store });
    vi.spyOn(useSoundsStore.persist, 'rehydrate').mockImplementation(() => {});
    const stopAmbient = vi.spyOn(ambientSoundPlayer, 'stop').mockImplementation(() => {});
    stubYoutubePlayer();
    useSoundsStore.setState({
      isLeader: true,
      activeSource: 'ambient',
      selectedAmbientSound: 'rain',
      isPlaying: false,
    });
    renderHook(() => useSoundsStorageSync());

    fake.emit(['soundsState']);
    await vi.advanceTimersByTimeAsync(50);

    expect(stopAmbient).toHaveBeenCalled();
  });
});
