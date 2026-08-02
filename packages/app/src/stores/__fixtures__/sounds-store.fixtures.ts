import { DEFAULT_YOUTUBE_PLAYLISTS } from '@cuewise/shared';
import { type Mock, vi } from 'vitest';
import { youtubePlayer } from '../../services/youtube-player';
import { useSoundsStore } from '../sounds-store';

const [firstPlaylist] = DEFAULT_YOUTUBE_PLAYLISTS;

export const leaderPlaylist = firstPlaylist;

export interface StubbedPlayer {
  loadPlaylist: Mock<typeof youtubePlayer.loadPlaylist>;
  play: Mock<typeof youtubePlayer.play>;
  stop: Mock<typeof youtubePlayer.stop>;
  pause: Mock<typeof youtubePlayer.pause>;
}

export interface StubPlayerOptions {
  /** A playlist already landed, so both the requested and the current id answer with it. */
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
  let isPlaying = playing;

  vi.spyOn(youtubePlayer, 'getCurrentPlaylistId').mockImplementation(() => current);
  vi.spyOn(youtubePlayer, 'getRequestedPlaylistId').mockImplementation(() => requested);
  vi.spyOn(youtubePlayer, 'isPlaying').mockImplementation(() => isPlaying);

  return {
    loadPlaylist: vi
      .spyOn(youtubePlayer, 'loadPlaylist')
      .mockImplementation((playlistId: string) => {
        requested = playlistId;
        current = null;
      }),
    play: vi.spyOn(youtubePlayer, 'play').mockImplementation(() => {
      isPlaying = true;
    }),
    pause: vi.spyOn(youtubePlayer, 'pause').mockImplementation(() => {
      isPlaying = false;
    }),
    stop: vi.spyOn(youtubePlayer, 'stop').mockImplementation(() => {
      requested = null;
      isPlaying = false;
    }),
  };
}

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
