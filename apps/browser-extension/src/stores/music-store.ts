/**
 * Music Store
 *
 * Manages YouTube music playback state and playlist selection for Pomodoro integration.
 * State is persisted to chrome.storage for cross-tab synchronization.
 * Only the leader tab (determined by useMusicLeader hook) controls the actual YouTube player.
 */

import {
  DEFAULT_YOUTUBE_PLAYLISTS,
  generateId,
  logger,
  type YoutubePlaylist,
} from '@cuewise/shared';
import { getCustomYoutubePlaylists, setCustomYoutubePlaylists } from '@cuewise/storage';
import { useEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { chromeLocalStorage } from '../adapters/zustand-chrome-adapter';
import { fetchPlaylistMetadata, youtubePlayer } from '../services/youtube-player';
import { useToastStore } from './toast-store';

interface MusicStore {
  // State (persisted across tabs)
  isPlaying: boolean;
  isPaused: boolean;
  volume: number;
  playlists: YoutubePlaylist[];
  selectedPlaylistId: string;

  // Local state (not persisted)
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  isBrowserOpen: boolean;
  isNowPlayingOpen: boolean;
  isLeader: boolean; // Only leader tab controls the player

  // Actions
  initialize: () => Promise<void>;
  setIsLeader: (isLeader: boolean) => void;
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

export const useMusicStore = create<MusicStore>()(
  persist(
    (set, get) => ({
      // Persisted state
      isPlaying: false,
      isPaused: false,
      volume: 50,
      playlists: [...DEFAULT_YOUTUBE_PLAYLISTS],
      selectedPlaylistId: '',

      // Local state (not persisted)
      isReady: false,
      isLoading: true,
      error: null,
      isBrowserOpen: false,
      isNowPlayingOpen: false,
      isLeader: false,

      initialize: async () => {
        const { isLeader } = get();

        try {
          // Only initialize YouTube player if we're the leader
          if (isLeader) {
            youtubePlayer.initialize();

            // Subscribe to player state changes (only leader listens)
            youtubePlayer.onStateChange((state) => {
              set({
                isReady: state.isReady,
              });
            });
          }

          // Load custom playlists from storage
          const customPlaylists = await getCustomYoutubePlaylists();

          // Merge default and custom playlists
          const allPlaylists = [...DEFAULT_YOUTUBE_PLAYLISTS, ...customPlaylists];

          set({
            playlists: allPlaylists,
            isLoading: false,
          });

          logger.debug('Music store initialized', { playlistCount: allPlaylists.length, isLeader });
        } catch (error) {
          logger.error('Error initializing music store', error);
          const errorMessage = 'Failed to initialize music player.';
          set({ error: errorMessage, isLoading: false });
          useToastStore.getState().error(errorMessage);
        }
      },

      setIsLeader: (isLeader: boolean) => {
        const wasLeader = get().isLeader;
        set({ isLeader });

        // If becoming leader, initialize the player
        if (isLeader && !wasLeader) {
          youtubePlayer.initialize();

          // Subscribe to player state changes
          youtubePlayer.onStateChange((state) => {
            set({ isReady: state.isReady });
          });

          // If music should be playing, start playback
          const { isPlaying, selectedPlaylistId, playlists, volume } = get();
          if (isPlaying && selectedPlaylistId) {
            const playlist = playlists.find((p) => p.id === selectedPlaylistId);
            if (playlist?.firstVideoId) {
              youtubePlayer.loadPlaylist(playlist.playlistId, playlist.firstVideoId, () => {
                youtubePlayer.play();
                youtubePlayer.setVolume(volume);
              });
            }
          }

          logger.info('This tab is now the music leader');
        }

        // If losing leadership, stop the player
        if (!isLeader && wasLeader) {
          youtubePlayer.destroy();
          set({ isReady: false });
          logger.info('This tab is no longer the music leader');
        }
      },

      play: () => {
        let { selectedPlaylistId } = get();
        const { playlists, isLeader } = get();

        // If no playlist selected, select the first one
        if (!selectedPlaylistId) {
          const firstPlaylist = playlists[0];
          if (firstPlaylist) {
            set({ selectedPlaylistId: firstPlaylist.id });
            selectedPlaylistId = firstPlaylist.id;
            logger.debug('Auto-selected first playlist for playback', {
              playlistId: firstPlaylist.id,
            });
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

        // Update state (synced across tabs)
        set({ isPlaying: true, isPaused: false });

        // Only leader controls the actual player
        if (isLeader) {
          const currentPlaylistId = youtubePlayer.getCurrentPlaylistId();
          if (currentPlaylistId !== playlist.playlistId) {
            // Load new playlist and play when ready
            youtubePlayer.loadPlaylist(playlist.playlistId, playlist.firstVideoId, () => {
              youtubePlayer.play();
            });
          } else {
            youtubePlayer.play();
          }
        }
      },

      pause: () => {
        const { isLeader } = get();
        set({ isPlaying: false, isPaused: true });

        // Only leader controls the actual player
        if (isLeader) {
          youtubePlayer.pause();
        }
      },

      stop: () => {
        const { isLeader } = get();
        set({ isPlaying: false, isPaused: false });

        // Only leader controls the actual player
        if (isLeader) {
          youtubePlayer.stop();
        }
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
        const { isLeader } = get();
        const clampedVolume = Math.max(0, Math.min(100, volume));
        set({ volume: clampedVolume });

        // Only leader controls the actual player
        if (isLeader) {
          youtubePlayer.setVolume(clampedVolume);
        }
      },

      selectPlaylist: async (playlistId: string) => {
        const { playlists, isPlaying, isLeader } = get();

        const playlist = playlists.find((p) => p.id === playlistId);
        if (!playlist) {
          logger.warn('Playlist not found', { playlistId });
          return;
        }

        set({ selectedPlaylistId: playlistId });

        // If currently playing, load and play the new playlist (only leader)
        if (isPlaying && playlist.firstVideoId && isLeader) {
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
    }),
    {
      name: 'musicState',
      storage: createJSONStorage(() => chromeLocalStorage),
      // Only persist playback state, not UI state or local state
      partialize: (state) => ({
        isPlaying: state.isPlaying,
        isPaused: state.isPaused,
        volume: state.volume,
        selectedPlaylistId: state.selectedPlaylistId,
        // Note: playlists are stored separately in customYoutubePlaylists
      }),
    }
  )
);

/**
 * React hook to sync Music state across tabs
 * Listens to chrome.storage changes and rehydrates the store
 * Leader tab also syncs YouTube player with state changes from other tabs
 */
export function useMusicStorageSync() {
  const isLeader = useMusicStore((state) => state.isLeader);

  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      // Only react to local storage changes
      if (areaName !== 'local') {
        return;
      }

      // Check if musicState changed
      const musicStateChange = changes.musicState;
      if (!musicStateChange) {
        return;
      }

      // Trigger rehydration to sync with other tabs
      useMusicStore.persist.rehydrate();

      // If we're the leader, sync the YouTube player with state changes from other tabs
      if (isLeader) {
        // Small delay to ensure rehydration completes
        setTimeout(() => {
          syncLeaderPlayback();
        }, 50);
      }
    };

    // Register listener
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.onChanged.addListener(handleStorageChange);
    }

    // Cleanup on unmount
    return () => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      }
    };
  }, [isLeader]);
}

/**
 * Sync the leader's YouTube player with the current store state
 * Called when leader receives state changes from other tabs
 */
function syncLeaderPlayback() {
  const { isPlaying, isPaused, selectedPlaylistId, playlists, volume } = useMusicStore.getState();

  logger.debug('Leader syncing playback state', { isPlaying, isPaused, selectedPlaylistId });

  if (isPlaying) {
    const playlist = playlists.find((p) => p.id === selectedPlaylistId);
    if (playlist?.firstVideoId) {
      const currentPlaylistId = youtubePlayer.getCurrentPlaylistId();
      if (currentPlaylistId !== playlist.playlistId) {
        // Different playlist - load and play
        youtubePlayer.loadPlaylist(playlist.playlistId, playlist.firstVideoId, () => {
          youtubePlayer.play();
          youtubePlayer.setVolume(volume);
        });
      } else if (!youtubePlayer.isPlaying()) {
        // Same playlist but not playing - just play
        youtubePlayer.play();
      }
    }
  } else if (isPaused) {
    if (youtubePlayer.isPlaying()) {
      youtubePlayer.pause();
    }
  } else {
    // Stopped (idle)
    youtubePlayer.stop();
  }
}
