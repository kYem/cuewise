import { DEFAULT_YOUTUBE_PLAYLISTS } from '@cuewise/shared';
import { vi } from 'vitest';
import { youtubePlayer } from '../../services/youtube-player';
import { useSoundsStore } from '../sounds-store';

const [firstPlaylist] = DEFAULT_YOUTUBE_PLAYLISTS;

export const leaderPlaylist = firstPlaylist;

export interface StubbedPlayer {
  loadPlaylist: ReturnType<typeof vi.spyOn>;
  play: ReturnType<typeof vi.spyOn>;
  stop: ReturnType<typeof vi.spyOn>;
  pause: ReturnType<typeof vi.spyOn>;
  /** Land the in-flight load, as the real iframe's onload does. */
  finishLoad: () => void;
}

export interface StubPlayerOptions {
  /** The playlist the player already has loaded, as getCurrentPlaylistId reports it. */
  loaded?: string | null;
  playing?: boolean;
}

/**
 * Keeps the requested/current playlist split the real player has: loadPlaylist records the request
 * synchronously, and only a landed load makes getCurrentPlaylistId agree.
 */
export function stubYoutubePlayer(options: StubPlayerOptions = {}): StubbedPlayer {
  const { loaded = null, playing = false } = options;
  let current = loaded;
  let requested = loaded;

  vi.spyOn(youtubePlayer, 'getCurrentPlaylistId').mockImplementation(() => current);
  vi.spyOn(youtubePlayer, 'getRequestedPlaylistId').mockImplementation(() => requested);
  vi.spyOn(youtubePlayer, 'isPlaying').mockReturnValue(playing);
  const loadPlaylist = vi
    .spyOn(youtubePlayer, 'loadPlaylist')
    .mockImplementation((playlistId: string) => {
      requested = playlistId;
    });
  const stop = vi.spyOn(youtubePlayer, 'stop').mockImplementation(() => {
    requested = null;
  });

  return {
    loadPlaylist,
    stop,
    play: vi.spyOn(youtubePlayer, 'play').mockImplementation(() => {}),
    pause: vi.spyOn(youtubePlayer, 'pause').mockImplementation(() => {}),
    finishLoad: () => {
      current = requested;
    },
  };
}

/** The leader tab, holding a playlist the panel says is playing. */
export function leaderPlayingYoutube(): void {
  useSoundsStore.setState({
    isLeader: true,
    activeSource: 'youtube',
    isPlaying: true,
    isPaused: false,
    selectedPlaylistId: leaderPlaylist.id,
    playlists: [...DEFAULT_YOUTUBE_PLAYLISTS],
  });
}
