import { afterEach, describe, expect, it, vi } from 'vitest';
import { youtubePlayer } from '../services/youtube-player';
import { leaderPlayingYoutube, stubYoutubePlayer } from './__fixtures__/sounds-store.fixtures';
import { useSoundsStore } from './sounds-store';

vi.mock('./toast-store', () => ({
  useToastStore: { getState: () => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }) },
}));

function persistedYoutubePlayback(): void {
  leaderPlayingYoutube();
  useSoundsStore.setState({ isLeader: false });
}

describe('setIsLeader', () => {
  afterEach(() => {
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

  it('keeps playback handed over by a tab that was holding it', () => {
    vi.spyOn(youtubePlayer, 'initialize').mockImplementation(() => {});
    stubYoutubePlayer();
    persistedYoutubePlayback();

    useSoundsStore.getState().setIsLeader(true, { fresh: false });

    expect(useSoundsStore.getState().isPlaying).toBe(true);
  });
});
