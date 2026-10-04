import { afterEach, describe, expect, it, vi } from 'vitest';
import { youtubePlayer } from '../services/youtube-player';
import {
  leaderPlayingYoutube,
  persistedAmbientPlayback,
  stubYoutubePlayer,
} from './__fixtures__/sounds-store.fixtures';
import { useSoundsStore } from './sounds-store';

vi.mock('@cuewise/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@cuewise/storage')>()),
  getCurrentVideoForPlaylist: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('./toast-store', () => ({
  useToastStore: { getState: () => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }) },
}));

function persistedYoutubePlayback(): void {
  leaderPlayingYoutube();
  useSoundsStore.setState({ isLeader: false });
}

/** Ends a hydration the way zustand's persist reports it to the store. */
function endHydration(error?: Error): void {
  const onRehydrate = useSoundsStore.persist.getOptions().onRehydrateStorage;
  if (onRehydrate === undefined) {
    throw new Error('the sounds store must watch its hydration');
  }
  const afterHydration = onRehydrate(useSoundsStore.getState());
  if (afterHydration === undefined) {
    throw new Error('the sounds store must hear how hydration ended');
  }
  afterHydration(useSoundsStore.getState(), error);
}

describe('setIsLeader', () => {
  afterEach(() => {
    endHydration(new Error('cancels any pending discard'));
    endHydration();
    useSoundsStore.setState(useSoundsStore.getInitialState());
  });

  it('drops playback a fresh session inherited from the last closed tab', () => {
    vi.spyOn(youtubePlayer, 'initialize').mockImplementation(() => {});
    vi.spyOn(useSoundsStore.persist, 'hasHydrated').mockReturnValue(true);
    const player = stubYoutubePlayer();
    persistedYoutubePlayback();

    useSoundsStore.getState().setIsLeader(true, { fresh: true });

    expect(useSoundsStore.getState().isPlaying).toBe(false);
    expect(player.loadPlaylist).not.toHaveBeenCalled();
  });

  it('drops it only once the persisted state has landed', () => {
    vi.spyOn(youtubePlayer, 'initialize').mockImplementation(() => {});
    vi.spyOn(useSoundsStore.persist, 'hasHydrated').mockReturnValue(false);
    let finishHydration = () => {};
    vi.spyOn(useSoundsStore.persist, 'onFinishHydration').mockImplementation((listener) => {
      finishHydration = () => listener(useSoundsStore.getState());
      return () => {};
    });
    stubYoutubePlayer();

    useSoundsStore.getState().setIsLeader(true, { fresh: true });
    persistedYoutubePlayback();
    useSoundsStore.setState({ isLeader: true });
    finishHydration();

    expect(useSoundsStore.getState().isPlaying).toBe(false);
  });

  it('still brings the YouTube player up when leading fresh', () => {
    const initialize = vi.spyOn(youtubePlayer, 'initialize').mockImplementation(() => {});
    vi.spyOn(useSoundsStore.persist, 'hasHydrated').mockReturnValue(true);
    stubYoutubePlayer();

    useSoundsStore.getState().setIsLeader(true, { fresh: true });

    expect(initialize).toHaveBeenCalled();
  });

  it('drops a pause a fresh session inherited from the last closed tab', () => {
    vi.spyOn(youtubePlayer, 'initialize').mockImplementation(() => {});
    vi.spyOn(useSoundsStore.persist, 'hasHydrated').mockReturnValue(true);
    stubYoutubePlayer();
    persistedYoutubePlayback();
    useSoundsStore.setState({ isPlaying: false, isPaused: true });

    useSoundsStore.getState().setIsLeader(true, { fresh: true });

    expect(useSoundsStore.getState().isPaused).toBe(false);
  });

  it('shows ambient paused on taking over when no tab is sounding it any more', () => {
    vi.spyOn(youtubePlayer, 'initialize').mockImplementation(() => {});
    persistedAmbientPlayback();

    useSoundsStore.getState().setIsLeader(true, { fresh: false, ambientSounding: false });

    expect(useSoundsStore.getState()).toMatchObject({ isPlaying: false, isPaused: true });
  });

  it('leaves ambient playing on taking over while another tab still sounds it', () => {
    vi.spyOn(youtubePlayer, 'initialize').mockImplementation(() => {});
    persistedAmbientPlayback();

    useSoundsStore.getState().setIsLeader(true, { fresh: false, ambientSounding: true });

    expect(useSoundsStore.getState().isPlaying).toBe(true);
  });

  it('restarts playback handed over by a tab that was holding it', async () => {
    vi.spyOn(youtubePlayer, 'initialize').mockImplementation(() => {});
    const player = stubYoutubePlayer();
    persistedYoutubePlayback();

    useSoundsStore.getState().setIsLeader(true, { fresh: false, ambientSounding: false });

    expect(useSoundsStore.getState().isPlaying).toBe(true);
    await vi.waitFor(() => expect(player.loadPlaylist).toHaveBeenCalled());
  });

  it('stops waiting to discard once hydration has failed', () => {
    vi.spyOn(youtubePlayer, 'initialize').mockImplementation(() => {});
    vi.spyOn(useSoundsStore.persist, 'hasHydrated').mockReturnValue(false);
    let listening = false;
    vi.spyOn(useSoundsStore.persist, 'onFinishHydration').mockImplementation(() => {
      listening = true;
      return () => {
        listening = false;
      };
    });
    stubYoutubePlayer();
    useSoundsStore.getState().setIsLeader(true, { fresh: true });

    endHydration(new Error('storage unavailable'));

    expect(listening).toBe(false);
  });

  it('waits to discard again once a later hydration has succeeded', () => {
    vi.spyOn(youtubePlayer, 'initialize').mockImplementation(() => {});
    vi.spyOn(useSoundsStore.persist, 'hasHydrated').mockReturnValue(false);
    const onFinish = vi
      .spyOn(useSoundsStore.persist, 'onFinishHydration')
      .mockImplementation(() => () => {});
    stubYoutubePlayer();
    endHydration(new Error('storage unavailable'));
    endHydration();

    useSoundsStore.getState().setIsLeader(true, { fresh: true });

    expect(onFinish).toHaveBeenCalled();
  });

  it('waits to discard once when leading fresh again before hydration lands', () => {
    vi.spyOn(youtubePlayer, 'initialize').mockImplementation(() => {});
    vi.spyOn(useSoundsStore.persist, 'hasHydrated').mockReturnValue(false);
    const onFinish = vi
      .spyOn(useSoundsStore.persist, 'onFinishHydration')
      .mockImplementation(() => () => {});
    stubYoutubePlayer();

    useSoundsStore.getState().setIsLeader(true, { fresh: true });
    useSoundsStore.getState().setIsLeader(false);
    useSoundsStore.getState().setIsLeader(true, { fresh: true });

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('does not wait to discard at all when hydration failed before this tab led', () => {
    vi.spyOn(youtubePlayer, 'initialize').mockImplementation(() => {});
    vi.spyOn(useSoundsStore.persist, 'hasHydrated').mockReturnValue(false);
    const onFinish = vi.spyOn(useSoundsStore.persist, 'onFinishHydration');
    stubYoutubePlayer();
    endHydration(new Error('storage unavailable'));

    useSoundsStore.getState().setIsLeader(true, { fresh: true });

    expect(onFinish).not.toHaveBeenCalled();
  });
});
