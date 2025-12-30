/**
 * Music Store
 *
 * Manages YouTube music playback state and playlist selection for Pomodoro integration.
 */

import {
  DEFAULT_YOUTUBE_PLAYLISTS,
  generateId,
  logger,
  type YoutubePlaylist,
} from '@cuewise/shared';
import { getCustomYoutubePlaylists, setCustomYoutubePlaylists } from '@cuewise/storage';
import { create } from 'zustand';
import { fetchPlaylistMetadata, youtubePlayer } from '../services/youtube-player';
import { useToastStore } from './toast-store';

interface MusicStore {
  // State
  isPlaying: boolean;
  isPaused: boolean;
  isReady: boolean;
  volume: number;
  playlists: YoutubePlaylist[];
  selectedPlaylistId: string;
  isLoading: boolean;
  error: string | null;
  isBrowserOpen: boolean;
  isNowPlayingOpen: boolean;

  // Actions
  initialize: () => Promise<void>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  togglePlayPause: () => void;
  setVolume: (volume: number) => void;
  selectPlaylist: (playlistId: string) => Promise<void>;
  addCustomPlaylist: (url: string, name?: string) => Promise<void>;
  removeCustomPlaylist: (id: string) => Promise<void>;
  openBrowser: () => void;
  closeBrowser: () => void;
  openNowPlaying: () => void;
  closeNowPlaying: () => void;
  getSelectedPlaylist: () => YoutubePlaylist | null;
}

interface ExtractedYouTubeInfo {
  playlistId: string;
  videoId?: string;
}

/**
 * Extract YouTube playlist ID and video ID from various URL formats
 * Supports:
 * - https://www.youtube.com/playlist?list=PLAYLIST_ID
 * - https://youtube.com/playlist?list=PLAYLIST_ID
 * - https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID
 */
function extractYouTubeInfo(url: string): ExtractedYouTubeInfo | null {
  try {
    const urlObj = new URL(url);

    // Check if it's a YouTube URL
    if (!urlObj.hostname.includes('youtube.com') && !urlObj.hostname.includes('youtu.be')) {
      return null;
    }

    // Get the list parameter (playlist ID)
    const listId = urlObj.searchParams.get('list');
    if (!listId) {
      return null;
    }

    // Get the video ID if present (from watch URLs)
    const videoId = urlObj.searchParams.get('v') || undefined;

    return { playlistId: listId, videoId };
  } catch {
    return null;
  }
}

export const useMusicStore = create<MusicStore>((set, get) => ({
  isPlaying: false,
  isPaused: false,
  isReady: false,
  volume: 50,
  playlists: [...DEFAULT_YOUTUBE_PLAYLISTS],
  selectedPlaylistId: '',
  isLoading: true,
  error: null,
  isBrowserOpen: false,
  isNowPlayingOpen: false,

  initialize: async () => {
    try {
      // Initialize YouTube player service
      youtubePlayer.initialize();

      // Subscribe to player state changes
      youtubePlayer.onStateChange((state) => {
        set({
          isPlaying: state.isPlaying,
          isPaused: state.isPaused,
          isReady: state.isReady,
          volume: state.volume,
        });
      });

      // Load custom playlists from storage
      const customPlaylists = await getCustomYoutubePlaylists();

      // Merge default and custom playlists
      const allPlaylists = [...DEFAULT_YOUTUBE_PLAYLISTS, ...customPlaylists];

      set({
        playlists: allPlaylists,
        isLoading: false,
      });

      logger.debug('Music store initialized', { playlistCount: allPlaylists.length });
    } catch (error) {
      logger.error('Error initializing music store', error);
      const errorMessage = 'Failed to initialize music player.';
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().error(errorMessage);
    }
  },

  play: () => {
    let { selectedPlaylistId } = get();
    const { playlists } = get();

    // If no playlist selected, select the first one
    if (!selectedPlaylistId) {
      const firstPlaylist = playlists[0];
      if (firstPlaylist) {
        set({ selectedPlaylistId: firstPlaylist.id });
        selectedPlaylistId = firstPlaylist.id;
        logger.debug('Auto-selected first playlist for playback', { playlistId: firstPlaylist.id });
      } else {
        logger.warn('No playlists available to play');
        return;
      }
    }

    // Find the playlist
    const playlist = playlists.find((p) => p.id === selectedPlaylistId);
    if (!playlist) {
      logger.warn('Selected playlist not found', { selectedPlaylistId });
      return;
    }

    // Ensure playlist has a firstVideoId for embedding
    if (!playlist.firstVideoId) {
      logger.warn('Playlist missing firstVideoId', { playlistId: playlist.playlistId });
      useToastStore.getState().error('This playlist cannot be played (missing video ID)');
      return;
    }

    // Load playlist if not already loaded, then play
    const currentPlaylistId = youtubePlayer.getCurrentPlaylistId();
    if (currentPlaylistId !== playlist.playlistId) {
      // Load new playlist and play when ready
      youtubePlayer.loadPlaylist(playlist.playlistId, playlist.firstVideoId, () => {
        youtubePlayer.play();
      });
    } else {
      youtubePlayer.play();
    }

    set({ isPlaying: true, isPaused: false });
  },

  pause: () => {
    youtubePlayer.pause();
    set({ isPlaying: false, isPaused: true });
  },

  stop: () => {
    youtubePlayer.stop();
    set({ isPlaying: false, isPaused: false });
  },

  togglePlayPause: () => {
    const { isPlaying } = get();
    if (isPlaying) {
      get().pause();
    } else {
      get().play();
    }
  },

  setVolume: (volume: number) => {
    const clampedVolume = Math.max(0, Math.min(100, volume));
    youtubePlayer.setVolume(clampedVolume);
    set({ volume: clampedVolume });
  },

  selectPlaylist: async (playlistId: string) => {
    const { playlists, isPlaying } = get();

    const playlist = playlists.find((p) => p.id === playlistId);
    if (!playlist) {
      logger.warn('Playlist not found', { playlistId });
      return;
    }

    set({ selectedPlaylistId: playlistId });

    // If currently playing, load and play the new playlist
    if (isPlaying && playlist.firstVideoId) {
      youtubePlayer.loadPlaylist(playlist.playlistId, playlist.firstVideoId, () => {
        youtubePlayer.play();
      });
    }

    logger.debug('Playlist selected', { playlistId, name: playlist.name });
  },

  addCustomPlaylist: async (url: string, name?: string) => {
    const { playlists } = get();

    // Extract playlist ID and video ID from URL
    const youtubeInfo = extractYouTubeInfo(url);
    if (!youtubeInfo) {
      const errorMessage = 'Invalid YouTube playlist URL. Please enter a valid playlist URL.';
      useToastStore.getState().error(errorMessage);
      return;
    }

    const { playlistId: youtubePlaylistId, videoId } = youtubeInfo;

    // Check if playlist already exists
    const existingPlaylist = playlists.find((p) => p.playlistId === youtubePlaylistId);
    if (existingPlaylist) {
      const errorMessage = 'This playlist has already been added.';
      useToastStore.getState().warning(errorMessage);
      return;
    }

    // Fetch playlist metadata from YouTube
    useToastStore.getState().info('Loading playlist info...');
    const metadata = await fetchPlaylistMetadata(youtubePlaylistId);

    // Use fetched metadata or fallback to defaults
    const playlistName =
      name ||
      metadata?.title ||
      `Custom Playlist ${playlists.filter((p) => p.isCustom).length + 1}`;
    const thumbnailUrl =
      metadata?.thumbnailUrl || `https://i.ytimg.com/vi/${youtubePlaylistId}/hqdefault.jpg`;

    // Create new playlist entry
    // Use video ID from URL if available, otherwise playlist won't be playable until we implement fetching first video
    const newPlaylist: YoutubePlaylist = {
      id: generateId(),
      name: playlistName,
      playlistId: youtubePlaylistId,
      thumbnailUrl,
      firstVideoId: videoId,
      isCustom: true,
    };

    try {
      // Get current custom playlists
      const customPlaylists = await getCustomYoutubePlaylists();
      const updatedCustomPlaylists = [...customPlaylists, newPlaylist];

      // Save to storage
      await setCustomYoutubePlaylists(updatedCustomPlaylists);

      // Update state
      set({ playlists: [...DEFAULT_YOUTUBE_PLAYLISTS, ...updatedCustomPlaylists] });

      useToastStore.getState().success(`Added "${playlistName}"`);
      logger.info('Custom playlist added', {
        name: newPlaylist.name,
        playlistId: youtubePlaylistId,
        metadataFetched: !!metadata,
      });
    } catch (error) {
      logger.error('Error adding custom playlist', error);
      const errorMessage = 'Failed to add playlist. Please try again.';
      useToastStore.getState().error(errorMessage);
    }
  },

  removeCustomPlaylist: async (id: string) => {
    const { playlists, selectedPlaylistId } = get();

    const playlist = playlists.find((p) => p.id === id);
    if (!playlist) {
      return;
    }

    if (!playlist.isCustom) {
      const errorMessage = 'Cannot remove built-in playlists.';
      useToastStore.getState().warning(errorMessage);
      return;
    }

    try {
      // Get current custom playlists and filter out the removed one
      const customPlaylists = await getCustomYoutubePlaylists();
      const updatedCustomPlaylists = customPlaylists.filter((p) => p.id !== id);

      // Save to storage
      await setCustomYoutubePlaylists(updatedCustomPlaylists);

      // Update state
      const newPlaylists = [...DEFAULT_YOUTUBE_PLAYLISTS, ...updatedCustomPlaylists];
      set({ playlists: newPlaylists });

      // If removed playlist was selected, clear selection
      if (selectedPlaylistId === id) {
        set({ selectedPlaylistId: '' });
      }

      useToastStore.getState().success('Playlist removed.');
      logger.info('Custom playlist removed', { name: playlist.name });
    } catch (error) {
      logger.error('Error removing custom playlist', error);
      const errorMessage = 'Failed to remove playlist. Please try again.';
      useToastStore.getState().error(errorMessage);
    }
  },

  openBrowser: () => {
    set({ isBrowserOpen: true });
  },

  closeBrowser: () => {
    set({ isBrowserOpen: false });
  },

  openNowPlaying: () => {
    set({ isNowPlayingOpen: true });
  },

  closeNowPlaying: () => {
    set({ isNowPlayingOpen: false });
  },

  getSelectedPlaylist: () => {
    const { playlists, selectedPlaylistId } = get();
    return playlists.find((p) => p.id === selectedPlaylistId) || null;
  },
}));
