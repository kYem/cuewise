/**
 * Unified Sounds Store
 *
 * Manages both ambient sounds and YouTube music playback in a unified store.
 * Key features:
 * - Mutually exclusive: Only one source (ambient or YouTube) can play at a time
 * - Cross-tab synchronization via chrome.storage
 * - YouTube timestamp memory for resume playback
 * - Leader election for YouTube player control
 */

import {
  type AmbientSoundType,
  DEFAULT_YOUTUBE_PLAYLISTS,
  generateId,
  logger,
  type SoundSource,
  type YoutubePlaylist,
} from '@cuewise/shared';
import {
  getCurrentVideoForPlaylist,
  getCustomYoutubePlaylists,
  setCustomYoutubePlaylists,
  updateVideoProgress,
} from '@cuewise/storage';
import { useEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { chromeLocalStorage } from '../adapters/zustand-chrome-adapter';
import { fetchPlaylistMetadata, youtubePlayer } from '../services/youtube-player';
import { ambientSoundPlayer } from '../utils/ambient-sounds';
import { useToastStore } from './toast-store';

interface SoundsStore {
  // Sound source (mutually exclusive)
  activeSource: SoundSource;

  // Panel/UI state
  isPanelOpen: boolean;
  activeTab: 'soundscapes' | 'youtube' | 'nowPlaying';

  // Ambient state
  selectedAmbientSound: AmbientSoundType;
  ambientVolume: number;

  // YouTube state
  playlists: YoutubePlaylist[];
  selectedPlaylistId: string;
  youtubeVolume: number;
  isYoutubeReady: boolean;
  isYoutubeLoading: boolean; // True while loading a new playlist

  // Playback state
  isPlaying: boolean;
  isPaused: boolean;

  // Leader state (for YouTube)
  isLeader: boolean;

  // Loading state
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  setIsLeader: (isLeader: boolean) => void;

  // Unified playback actions
  playAmbient: (sound: AmbientSoundType) => void;
  playYoutube: (playlistId?: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  togglePlayPause: () => void;

  // Volume controls
  setAmbientVolume: (volume: number) => void;
  setYoutubeVolume: (volume: number) => void;

  // Panel actions
  openPanel: (tab?: 'soundscapes' | 'youtube' | 'nowPlaying') => void;
  closePanel: () => void;
  setActiveTab: (tab: 'soundscapes' | 'youtube' | 'nowPlaying') => void;

  // Playlist management
  selectPlaylist: (playlistId: string) => Promise<void>;
  addCustomPlaylist: (url: string, name?: string) => Promise<void>;
  removeCustomPlaylist: (id: string) => Promise<void>;

  // Getters
  getSelectedPlaylist: () => YoutubePlaylist | null;
  getActiveSourceName: () => string;
}

interface ExtractedYouTubeInfo {
  playlistId: string;
  videoId?: string;
}

/**
 * Extract YouTube playlist ID and video ID from various URL formats
 */
function extractYouTubeInfo(url: string): ExtractedYouTubeInfo | null {
  try {
    const urlObj = new URL(url);

    if (!urlObj.hostname.includes('youtube.com') && !urlObj.hostname.includes('youtu.be')) {
      return null;
    }

    const listId = urlObj.searchParams.get('list');
    if (!listId) {
      return null;
    }

    const videoId = urlObj.searchParams.get('v') || undefined;
    return { playlistId: listId, videoId };
  } catch {
    return null;
  }
}

export const useSoundsStore = create<SoundsStore>()(
  persist(
    (set, get) => ({
      // Initial state
      activeSource: 'none',
      isPanelOpen: false,
      activeTab: 'youtube',
      selectedAmbientSound: 'none',
      ambientVolume: 50,
      playlists: [...DEFAULT_YOUTUBE_PLAYLISTS],
      selectedPlaylistId: '',
      youtubeVolume: 50,
      isYoutubeReady: false,
      isYoutubeLoading: false,
      isPlaying: false,
      isPaused: false,
      isLeader: false,
      isLoading: true,
      error: null,

      initialize: async () => {
        const { isLeader } = get();

        try {
          // Only initialize YouTube player if we're the leader
          if (isLeader) {
            youtubePlayer.initialize();

            // Subscribe to player state changes
            youtubePlayer.onStateChange((state) => {
              set({ isYoutubeReady: state.isReady });
            });

            // Subscribe to time updates for timestamp memory
            youtubePlayer.onTimeUpdate(async (videoId, time) => {
              const playlistId = youtubePlayer.getCurrentPlaylistId();
              if (playlistId) {
                await updateVideoProgress(playlistId, videoId, time);
              }
            });
          }

          // Load custom playlists from storage
          const customPlaylists = await getCustomYoutubePlaylists();
          const allPlaylists = [...DEFAULT_YOUTUBE_PLAYLISTS, ...customPlaylists];

          set({
            playlists: allPlaylists,
            isLoading: false,
          });

          logger.debug('Sounds store initialized', {
            playlistCount: allPlaylists.length,
            isLeader,
          });
        } catch (error) {
          logger.error('Error initializing sounds store', error);
          const errorMessage = 'Failed to initialize sounds.';
          set({ error: errorMessage, isLoading: false });
          useToastStore.getState().error(errorMessage);
        }
      },

      setIsLeader: (isLeader: boolean) => {
        const wasLeader = get().isLeader;
        set({ isLeader });

        if (isLeader && !wasLeader) {
          youtubePlayer.initialize();

          youtubePlayer.onStateChange((state) => {
            set({ isYoutubeReady: state.isReady });
          });

          youtubePlayer.onTimeUpdate(async (videoId, time) => {
            const playlistId = youtubePlayer.getCurrentPlaylistId();
            if (playlistId) {
              await updateVideoProgress(playlistId, videoId, time);
            }
          });

          // Resume playback if YouTube was active
          const { activeSource, isPlaying, selectedPlaylistId, playlists, youtubeVolume } = get();
          if (activeSource === 'youtube' && isPlaying && selectedPlaylistId) {
            const playlist = playlists.find((p) => p.id === selectedPlaylistId);
            if (playlist?.firstVideoId) {
              set({ isYoutubeLoading: true });
              // Get last played video and timestamp (or fall back to first video)
              getCurrentVideoForPlaylist(playlist.playlistId).then((resumeInfo) => {
                const videoId = resumeInfo?.videoId || playlist.firstVideoId;
                const startAt = resumeInfo?.timestamp || 0;
                if (!videoId) {
                  set({ isYoutubeLoading: false });
                  return;
                }
                youtubePlayer.loadPlaylist(
                  playlist.playlistId,
                  videoId,
                  () => {
                    youtubePlayer.play();
                    youtubePlayer.setVolume(youtubeVolume);
                    set({ isYoutubeLoading: false });
                  },
                  startAt
                );
              });
            }
          }

          logger.info('This tab is now the sounds leader');
        }

        if (!isLeader && wasLeader) {
          youtubePlayer.destroy();
          set({ isYoutubeReady: false });
          logger.info('This tab is no longer the sounds leader');
        }
      },

      playAmbient: (sound: AmbientSoundType) => {
        const { activeSource, isLeader, ambientVolume } = get();

        // Stop YouTube if it's playing
        if (activeSource === 'youtube' && isLeader) {
          youtubePlayer.stop();
        }

        if (sound === 'none') {
          ambientSoundPlayer.stop();
          set({
            activeSource: 'none',
            selectedAmbientSound: 'none',
            isPlaying: false,
            isPaused: false,
          });
        } else {
          // If same sound is already playing, just stop it (toggle behavior)
          if (ambientSoundPlayer.getCurrentSound() === sound && ambientSoundPlayer.getIsPlaying()) {
            ambientSoundPlayer.stop();
            set({
              activeSource: 'none',
              selectedAmbientSound: 'none',
              isPlaying: false,
              isPaused: false,
            });
          } else {
            // Stop any existing ambient sound first
            if (ambientSoundPlayer.getIsPlaying()) {
              ambientSoundPlayer.stop();
            }

            // Small delay to allow previous sound to fade out
            setTimeout(() => {
              ambientSoundPlayer.play(sound, ambientVolume);
              set({
                activeSource: 'ambient',
                selectedAmbientSound: sound,
                isPlaying: true,
                isPaused: false,
              });
            }, 100);
          }
        }
      },

      playYoutube: async (playlistId?: string) => {
        const { selectedPlaylistId, playlists, isLeader, youtubeVolume } = get();

        // Stop ambient if playing
        if (ambientSoundPlayer.getIsPlaying()) {
          ambientSoundPlayer.stop();
        }

        const targetPlaylistId = playlistId || selectedPlaylistId || playlists[0]?.id;

        if (!targetPlaylistId) {
          logger.warn('No playlist available to play');
          return;
        }

        const playlist = playlists.find((p) => p.id === targetPlaylistId);
        if (!playlist) {
          logger.warn('Playlist not found', { targetPlaylistId });
          return;
        }

        if (!playlist.firstVideoId) {
          logger.warn('Playlist missing firstVideoId', { playlistId: playlist.playlistId });
          useToastStore.getState().error('This playlist cannot be played (missing video ID)');
          return;
        }

        if (isLeader) {
          // Get last played video and timestamp (or fall back to first video)
          const resumeInfo = await getCurrentVideoForPlaylist(playlist.playlistId);
          const videoId = resumeInfo?.videoId || playlist.firstVideoId;
          const startAt = resumeInfo?.timestamp || 0;

          const currentPlaylistId = youtubePlayer.getCurrentPlaylistId();
          if (currentPlaylistId !== playlist.playlistId) {
            // Set loading state before loading new playlist
            set({
              activeSource: 'youtube',
              selectedPlaylistId: targetPlaylistId,
              isPlaying: true,
              isPaused: false,
              isYoutubeLoading: true,
              activeTab: 'nowPlaying',
            });

            youtubePlayer.loadPlaylist(
              playlist.playlistId,
              videoId,
              () => {
                youtubePlayer.play();
                youtubePlayer.setVolume(youtubeVolume);
                set({ isYoutubeLoading: false });
              },
              startAt
            );
          } else {
            // Same playlist, just seek and play
            set({
              activeSource: 'youtube',
              selectedPlaylistId: targetPlaylistId,
              isPlaying: true,
              isPaused: false,
              activeTab: 'nowPlaying',
            });
            if (startAt > 0) {
              youtubePlayer.seekTo(startAt);
            }
            youtubePlayer.play();
          }
        } else {
          // Not leader, just update state
          set({
            activeSource: 'youtube',
            selectedPlaylistId: targetPlaylistId,
            isPlaying: true,
            isPaused: false,
            activeTab: 'nowPlaying',
          });
        }
      },

      pause: () => {
        const { activeSource, isLeader } = get();

        if (activeSource === 'ambient') {
          ambientSoundPlayer.stop();
        } else if (activeSource === 'youtube' && isLeader) {
          youtubePlayer.pause();
        }

        set({ isPlaying: false, isPaused: true });
      },

      resume: () => {
        const { activeSource, selectedAmbientSound, ambientVolume } = get();

        if (activeSource === 'ambient' && selectedAmbientSound !== 'none') {
          ambientSoundPlayer.play(selectedAmbientSound, ambientVolume);
          set({ isPlaying: true, isPaused: false });
        } else if (activeSource === 'youtube') {
          // Use playYoutube to ensure playlist is loaded and handles leader election
          get().playYoutube();
        }
      },

      stop: () => {
        const { activeSource, isLeader } = get();

        if (activeSource === 'ambient') {
          ambientSoundPlayer.stop();
        } else if (activeSource === 'youtube' && isLeader) {
          youtubePlayer.stop();
        }

        // Keep activeSource so user can play again without re-selecting
        set({
          isPlaying: false,
          isPaused: false,
        });
      },

      togglePlayPause: () => {
        const { isPlaying, activeSource } = get();

        if (isPlaying) {
          get().pause();
        } else if (activeSource !== 'none') {
          // Resume if we have an active source (whether paused or stopped)
          get().resume();
        }
      },

      setAmbientVolume: (volume: number) => {
        const clampedVolume = Math.max(0, Math.min(100, volume));
        set({ ambientVolume: clampedVolume });

        if (ambientSoundPlayer.getIsPlaying()) {
          ambientSoundPlayer.setVolume(clampedVolume);
        }
      },

      setYoutubeVolume: (volume: number) => {
        const { isLeader } = get();
        const clampedVolume = Math.max(0, Math.min(100, volume));
        set({ youtubeVolume: clampedVolume });

        if (isLeader) {
          youtubePlayer.setVolume(clampedVolume);
        }
      },

      openPanel: (tab?: 'soundscapes' | 'youtube' | 'nowPlaying') => {
        set({ isPanelOpen: true, ...(tab && { activeTab: tab }) });
      },

      closePanel: () => {
        set({ isPanelOpen: false });
      },

      setActiveTab: (tab: 'soundscapes' | 'youtube' | 'nowPlaying') => {
        set({ activeTab: tab });
      },

      selectPlaylist: async (playlistId: string) => {
        const { playlists, isPlaying, isLeader, activeSource, youtubeVolume } = get();

        const playlist = playlists.find((p) => p.id === playlistId);
        if (!playlist) {
          logger.warn('Playlist not found', { playlistId });
          return;
        }

        set({ selectedPlaylistId: playlistId });

        // If currently playing YouTube, load the new playlist
        if (isPlaying && activeSource === 'youtube' && playlist.firstVideoId && isLeader) {
          // Set loading state
          set({ isYoutubeLoading: true });

          // Get last played video and timestamp (or fall back to first video)
          const resumeInfo = await getCurrentVideoForPlaylist(playlist.playlistId);
          const videoId = resumeInfo?.videoId || playlist.firstVideoId;
          const startAt = resumeInfo?.timestamp || 0;
          youtubePlayer.loadPlaylist(
            playlist.playlistId,
            videoId,
            () => {
              youtubePlayer.play();
              youtubePlayer.setVolume(youtubeVolume);
              set({ isYoutubeLoading: false });
            },
            startAt
          );
        }

        logger.debug('Playlist selected', { playlistId, name: playlist.name });
      },

      addCustomPlaylist: async (url: string, name?: string) => {
        const { playlists } = get();

        const youtubeInfo = extractYouTubeInfo(url);
        if (!youtubeInfo) {
          const errorMessage = 'Invalid YouTube playlist URL.';
          useToastStore.getState().error(errorMessage);
          return;
        }

        const { playlistId: youtubePlaylistId, videoId } = youtubeInfo;

        const existingPlaylist = playlists.find((p) => p.playlistId === youtubePlaylistId);
        if (existingPlaylist) {
          useToastStore.getState().warning('This playlist has already been added.');
          return;
        }

        useToastStore.getState().info('Loading playlist info...');
        const metadata = await fetchPlaylistMetadata(youtubePlaylistId);

        const playlistName =
          name ||
          metadata?.title ||
          `Custom Playlist ${playlists.filter((p) => p.isCustom).length + 1}`;
        const thumbnailUrl =
          metadata?.thumbnailUrl || `https://i.ytimg.com/vi/${youtubePlaylistId}/hqdefault.jpg`;

        const newPlaylist: YoutubePlaylist = {
          id: generateId(),
          name: playlistName,
          playlistId: youtubePlaylistId,
          thumbnailUrl,
          firstVideoId: videoId,
          isCustom: true,
        };

        try {
          const customPlaylists = await getCustomYoutubePlaylists();
          const updatedCustomPlaylists = [...customPlaylists, newPlaylist];

          await setCustomYoutubePlaylists(updatedCustomPlaylists);

          set({ playlists: [...DEFAULT_YOUTUBE_PLAYLISTS, ...updatedCustomPlaylists] });

          useToastStore.getState().success(`Added "${playlistName}"`);
          logger.info('Custom playlist added', {
            name: newPlaylist.name,
            playlistId: youtubePlaylistId,
          });
        } catch (error) {
          logger.error('Error adding custom playlist', error);
          useToastStore.getState().error('Failed to add playlist.');
        }
      },

      removeCustomPlaylist: async (id: string) => {
        const { playlists, selectedPlaylistId } = get();

        const playlist = playlists.find((p) => p.id === id);
        if (!playlist) {
          return;
        }

        if (!playlist.isCustom) {
          useToastStore.getState().warning('Cannot remove built-in playlists.');
          return;
        }

        try {
          const customPlaylists = await getCustomYoutubePlaylists();
          const updatedCustomPlaylists = customPlaylists.filter((p) => p.id !== id);

          await setCustomYoutubePlaylists(updatedCustomPlaylists);

          const newPlaylists = [...DEFAULT_YOUTUBE_PLAYLISTS, ...updatedCustomPlaylists];
          set({ playlists: newPlaylists });

          if (selectedPlaylistId === id) {
            set({ selectedPlaylistId: '' });
          }

          useToastStore.getState().success('Playlist removed.');
          logger.info('Custom playlist removed', { name: playlist.name });
        } catch (error) {
          logger.error('Error removing custom playlist', error);
          useToastStore.getState().error('Failed to remove playlist.');
        }
      },

      getSelectedPlaylist: () => {
        const { playlists, selectedPlaylistId } = get();
        return playlists.find((p) => p.id === selectedPlaylistId) || null;
      },

      getActiveSourceName: () => {
        const { activeSource, selectedAmbientSound } = get();

        if (activeSource === 'ambient') {
          const names: Record<AmbientSoundType, string> = {
            none: 'None',
            rain: 'Rain',
            ocean: 'Ocean Waves',
            forest: 'Forest',
            cafe: 'Cafe Ambience',
            whiteNoise: 'White Noise',
            brownNoise: 'Brown Noise',
          };
          return names[selectedAmbientSound];
        }

        if (activeSource === 'youtube') {
          const playlist = get().getSelectedPlaylist();
          return playlist?.name || 'YouTube Music';
        }

        return 'None';
      },
    }),
    {
      name: 'soundsState',
      storage: createJSONStorage(() => chromeLocalStorage),
      partialize: (state) => ({
        activeSource: state.activeSource,
        selectedAmbientSound: state.selectedAmbientSound,
        ambientVolume: state.ambientVolume,
        selectedPlaylistId: state.selectedPlaylistId,
        youtubeVolume: state.youtubeVolume,
        isPlaying: state.isPlaying,
        isPaused: state.isPaused,
      }),
    }
  )
);

/**
 * React hook to sync sounds state across tabs
 */
export function useSoundsStorageSync() {
  const isLeader = useSoundsStore((state) => state.isLeader);

  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') {
        return;
      }

      const soundsStateChange = changes.soundsState;
      if (!soundsStateChange) {
        return;
      }

      useSoundsStore.persist.rehydrate();

      if (isLeader) {
        setTimeout(() => {
          syncLeaderPlayback();
        }, 50);
      }
    };

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.onChanged.addListener(handleStorageChange);
    }

    return () => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      }
    };
  }, [isLeader]);
}

/**
 * Sync the leader's playback with the current store state
 */
async function syncLeaderPlayback() {
  const {
    activeSource,
    isPlaying,
    isPaused,
    selectedPlaylistId,
    playlists,
    youtubeVolume,
    selectedAmbientSound,
    ambientVolume,
  } = useSoundsStore.getState();

  logger.debug('Leader syncing playback state', { activeSource, isPlaying, isPaused });

  if (activeSource === 'youtube') {
    if (isPlaying) {
      const playlist = playlists.find((p) => p.id === selectedPlaylistId);
      if (playlist?.firstVideoId) {
        const currentPlaylistId = youtubePlayer.getCurrentPlaylistId();
        if (currentPlaylistId !== playlist.playlistId) {
          useSoundsStore.setState({ isYoutubeLoading: true });
          // Get last played video and timestamp (or fall back to first video)
          const resumeInfo = await getCurrentVideoForPlaylist(playlist.playlistId);
          const videoId = resumeInfo?.videoId || playlist.firstVideoId;
          const startAt = resumeInfo?.timestamp || 0;
          youtubePlayer.loadPlaylist(
            playlist.playlistId,
            videoId,
            () => {
              youtubePlayer.play();
              youtubePlayer.setVolume(youtubeVolume);
              useSoundsStore.setState({ isYoutubeLoading: false });
            },
            startAt
          );
        } else if (!youtubePlayer.isPlaying()) {
          youtubePlayer.play();
        }
      }
    } else if (isPaused) {
      if (youtubePlayer.isPlaying()) {
        youtubePlayer.pause();
      }
    } else {
      youtubePlayer.stop();
    }
  } else if (activeSource === 'ambient') {
    // Ambient sounds are local only, not synced across tabs
    if (isPlaying && selectedAmbientSound !== 'none') {
      if (!ambientSoundPlayer.getIsPlaying()) {
        ambientSoundPlayer.play(selectedAmbientSound, ambientVolume);
      }
    } else {
      ambientSoundPlayer.stop();
    }
  } else {
    // No active source - stop everything
    youtubePlayer.stop();
    ambientSoundPlayer.stop();
  }
}
