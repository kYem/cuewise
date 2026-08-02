/**
 * Unified Sounds Store
 *
 * Manages both ambient sounds and YouTube music playback in a unified store.
 * Key features:
 * - Mutually exclusive: Only one source (ambient or YouTube) can play at a time
 * - Cross-tab synchronization: persisted through the chrome adapter, notified through the port
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
import { observableStorage, safeSubscribe } from './storage-changes';
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

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'youtu.be']);

// Exact/suffix match only — `.includes()` also matched spoofed hosts like
// youtube.com.evil.com or notyoutube.com.
function isYouTubeHostname(hostname: string): boolean {
  return YOUTUBE_HOSTS.has(hostname) || hostname.endsWith('.youtube.com');
}

/**
 * Extract YouTube playlist ID and video ID from various URL formats
 */
export function extractYouTubeInfo(url: string): ExtractedYouTubeInfo | null {
  try {
    const urlObj = new URL(url);

    if (!isYouTubeHostname(urlObj.hostname)) {
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

/** Wire the YouTube player callbacks for the leader tab (ready state + progress persistence). */
function initYoutubeLeader(set: (partial: Partial<SoundsStore>) => void): void {
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
            initYoutubeLeader(set);
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
          initYoutubeLeader(set);

          // Resume playback if YouTube was active
          const { activeSource, isPlaying, selectedPlaylistId, playlists } = get();
          if (activeSource === 'youtube' && isPlaying && selectedPlaylistId) {
            const playlist = playlists.find((p) => p.id === selectedPlaylistId);
            if (playlist?.firstVideoId) {
              set({ isYoutubeLoading: true });
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
                  finishYoutubeLoad,
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
        const { selectedPlaylistId, playlists, isLeader } = get();

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

            youtubePlayer.loadPlaylist(playlist.playlistId, videoId, finishYoutubeLoad, startAt);
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

        // Loading is what the panel shows over a player about to start, which a pause has just
        // said it should not.
        set({ isPlaying: false, isPaused: true, isYoutubeLoading: false });
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
          isYoutubeLoading: false,
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
        const { playlists, isPlaying, isLeader, activeSource } = get();

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
          youtubePlayer.loadPlaylist(playlist.playlistId, videoId, finishYoutubeLoad, startAt);
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
    const store = observableStorage();
    if (store === null) {
      return;
    }
    // Tracked so a handoff scheduled just before a leadership flip or an unmount can't restart the
    // player from a tab that is no longer the leader.
    let handoff: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = safeSubscribe(store, 'ambient sounds', (keys, area) => {
      if (area !== 'local' || !keys.includes('soundsState')) {
        return;
      }
      // Caught here, not returned: the port's guard logs a rejection without naming what failed.
      const rehydrated = Promise.resolve(useSoundsStore.persist.rehydrate()).catch((error) => {
        logger.error('Could not rehydrate the sounds state after a storage change', error);
      });
      // Every tab, not only the leader: ambient plays out of whichever tab pressed it, so this is
      // the one place that can silence what this tab is holding.
      rehydrated.then(silenceAmbientUnlessWanted).catch((error) => {
        logger.error('Could not reconcile ambient playback after a storage change', error);
      });
      if (isLeader) {
        // One pending handoff at a time: a newer state supersedes the one the last event scheduled.
        clearTimeout(handoff);
        handoff = setTimeout(() => {
          // Chained, not raced: syncing reads the store, so a read slower than the delay would
          // otherwise reconcile the player against the state this change already replaced.
          rehydrated
            .then(() => {
              // Re-checked because clearTimeout stops guarding once the timer has fired: a flip
              // during the rehydrate would otherwise let a resigned tab restart the player.
              if (!useSoundsStore.getState().isLeader) {
                return undefined;
              }
              return syncLeaderPlayback();
            })
            .catch((error) => {
              logger.error('Could not sync leader playback after a storage change', error);
            });
        }, 50);
      }
    });
    return () => {
      clearTimeout(handoff);
      unsubscribe?.();
    };
  }, [isLeader]);
}

/**
 * Custom playlists are built per tab and never persisted, so one added in another tab is unknown
 * here until they are re-read — and the request for it would otherwise be dropped in silence.
 */
async function findPlaylist(
  playlists: YoutubePlaylist[],
  selectedPlaylistId: string
): Promise<YoutubePlaylist | undefined> {
  const known = playlists.find((p) => p.id === selectedPlaylistId);
  if (known) {
    return known;
  }

  const refreshed = [...DEFAULT_YOUTUBE_PLAYLISTS, ...(await getCustomYoutubePlaylists())];
  useSoundsStore.setState({ playlists: refreshed });

  const found = refreshed.find((p) => p.id === selectedPlaylistId);
  if (!found) {
    logger.warn('Another tab asked for a playlist this one cannot find', { selectedPlaylistId });
  }
  return found;
}

/**
 * Stop but never start: playAmbient already runs in the tab that pressed it, so starting here
 * would sound the same thing twice — while stopping is what a remote stop has no other route to.
 */
function silenceAmbientUnlessWanted(): void {
  const { activeSource, isPlaying, selectedAmbientSound } = useSoundsStore.getState();
  const wanted =
    activeSource === 'ambient' &&
    isPlaying &&
    ambientSoundPlayer.getCurrentSound() === selectedAmbientSound;

  if (!wanted) {
    ambientSoundPlayer.stop();
  }
}

/** The load landed, but a stop, a pause or a switch of source since is what should win. */
function finishYoutubeLoad(): void {
  // Read now rather than captured when the load began — the volume may have been dragged since.
  // activeSource is checked too because isPlaying is true for ambient as well.
  const { isPlaying, activeSource, youtubeVolume } = useSoundsStore.getState();
  useSoundsStore.setState({ isYoutubeLoading: false });

  if (!isPlaying || activeSource !== 'youtube') {
    return;
  }

  youtubePlayer.play();
  youtubePlayer.setVolume(youtubeVolume);
}

/**
 * Sync the leader's playback with the current store state
 */
async function syncLeaderPlayback() {
  const { activeSource, isPlaying, isPaused, selectedPlaylistId, playlists } =
    useSoundsStore.getState();

  logger.debug('Leader syncing playback state', { activeSource, isPlaying, isPaused });

  if (activeSource === 'youtube') {
    if (isPlaying) {
      const playlist = await findPlaylist(playlists, selectedPlaylistId);
      if (playlist?.firstVideoId) {
        const currentPlaylistId = youtubePlayer.getCurrentPlaylistId();
        if (currentPlaylistId !== playlist.playlistId) {
          // loadPlaylist tears down the iframe it finds, so acting while one is already in flight
          // for this playlist would restart the load the last change started.
          if (youtubePlayer.getRequestedPlaylistId() === playlist.playlistId) {
            return;
          }
          useSoundsStore.setState({ isYoutubeLoading: true });
          try {
            // Get last played video and timestamp (or fall back to first video)
            const resumeInfo = await getCurrentVideoForPlaylist(playlist.playlistId);
            const videoId = resumeInfo?.videoId || playlist.firstVideoId;
            const startAt = resumeInfo?.timestamp || 0;
            youtubePlayer.loadPlaylist(playlist.playlistId, videoId, finishYoutubeLoad, startAt);
          } catch (error) {
            // Logged first: a throw from the recovery below would otherwise replace this cause.
            logger.error('Could not load the playlist for leader playback', error);
            // That callback is what starts playback, so nothing is playing — and left as-is the
            // panel renders its "playing" indicator over silence.
            useSoundsStore.setState({
              isYoutubeLoading: false,
              isPlaying: false,
              isPaused: false,
            });
            useToastStore
              .getState()
              .error('Could not start the playlist. Press play to try again.');
            throw error;
          }
        } else if (!youtubePlayer.isPlaying()) {
          youtubePlayer.play();
        }
      }
    } else if (isPaused) {
      if (youtubePlayer.isPlaying()) {
        youtubePlayer.pause();
      }
      abandonYoutubeLoad();
    } else {
      youtubePlayer.stop();
      abandonYoutubeLoad();
    }
  } else {
    youtubePlayer.stop();
    abandonYoutubeLoad();
  }
}

/** Nothing here is going to start playing, so the panel should not still be promising it. */
function abandonYoutubeLoad(): void {
  if (useSoundsStore.getState().isYoutubeLoading) {
    useSoundsStore.setState({ isYoutubeLoading: false });
  }
}
