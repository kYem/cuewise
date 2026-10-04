import { afterEach, describe, expect, it, vi } from 'vitest';
import { youtubePlayer } from '../services/youtube-player';
import { leaderPlayingYoutube, stubYoutubePlayer } from './__fixtures__/sounds-store.fixtures';
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

  it('restarts playback handed over by a tab that was holding it', async () => {
    vi.spyOn(youtubePlayer, 'initialize').mockImplementation(() => {});
    const player = stubYoutubePlayer();
    persistedYoutubePlayback();

    useSoundsStore.getState().setIsLeader(true, { fresh: false });

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

    const onRehydrate = useSoundsStore.persist.getOptions().onRehydrateStorage;
    if (onRehydrate === undefined) {
      throw new Error('the sounds store must watch its hydration');
    }
    const afterHydration = onRehydrate(useSoundsStore.getState());
    if (afterHydration === undefined) {
      throw new Error('the sounds store must hear how hydration ended');
    }
    afterHydration(undefined, new Error('storage unavailable'));

    expect(listening).toBe(false);
  });
});
