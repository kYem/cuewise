import {
  DAY_IN_MS,
  logger,
  type PlaylistProgress,
  playlistProgressSchema,
  STORAGE_KEYS,
  storageFailure,
  type YoutubePlaylist,
  youtubePlaylistSchema,
} from '@cuewise/shared';
import {
  getValidatedListFromStorage,
  type StorageResult,
  setValidatedListInStorage,
} from './chrome-storage';

// Custom YouTube Playlists (for Pomodoro music)
// Note: Custom playlists are stored in local storage (not synced)
export async function getCustomYoutubePlaylists(): Promise<YoutubePlaylist[]> {
  const playlists = await getValidatedListFromStorage<YoutubePlaylist>(
    STORAGE_KEYS.CUSTOM_YOUTUBE_PLAYLISTS,
    youtubePlaylistSchema,
    'local'
  );
  return playlists ?? [];
}

export async function setCustomYoutubePlaylists(
  playlists: YoutubePlaylist[]
): Promise<StorageResult> {
  return setValidatedListInStorage(
    STORAGE_KEYS.CUSTOM_YOUTUBE_PLAYLISTS,
    playlists,
    youtubePlaylistSchema,
    'local'
  );
}

// YouTube Progress (timestamp memory)
// Note: Progress is stored in local storage only (not synced)
const PROGRESS_MAX_AGE_MS = 30 * DAY_IN_MS;

/**
 * Get all YouTube playlist progress data
 */
export async function getYoutubeProgress(): Promise<PlaylistProgress[]> {
  const progress = await getValidatedListFromStorage<PlaylistProgress>(
    STORAGE_KEYS.YOUTUBE_PROGRESS,
    playlistProgressSchema,
    'local'
  );
  return progress ?? [];
}

/**
 * Update video progress (timestamp) for a specific video in a playlist
 * Also cleans up entries older than 30 days
 */
export async function updateVideoProgress(
  playlistId: string,
  videoId: string,
  timestamp: number
): Promise<StorageResult> {
  try {
    const allProgress = await getYoutubeProgress();
    const now = new Date().toISOString();
    const cutoffTime = Date.now() - PROGRESS_MAX_AGE_MS;

    // Find or create playlist progress
    let playlistProgress = allProgress.find((p) => p.playlistId === playlistId);

    if (!playlistProgress) {
      playlistProgress = {
        playlistId,
        currentVideoId: videoId,
        videoProgress: [],
      };
      allProgress.push(playlistProgress);
    }

    // Update current video
    playlistProgress.currentVideoId = videoId;

    // Update or add video progress
    const existingVideoProgress = playlistProgress.videoProgress.find((v) => v.videoId === videoId);

    if (existingVideoProgress) {
      existingVideoProgress.timestamp = timestamp;
      existingVideoProgress.updatedAt = now;
    } else {
      playlistProgress.videoProgress.push({
        videoId,
        timestamp,
        updatedAt: now,
      });
    }

    // Clean up old entries (videos not updated in 30 days)
    playlistProgress.videoProgress = playlistProgress.videoProgress.filter((v) => {
      const updatedAt = new Date(v.updatedAt).getTime();
      return updatedAt > cutoffTime;
    });

    // Remove playlists with no video progress
    const cleanedProgress = allProgress.filter((p) => p.videoProgress.length > 0);

    return setValidatedListInStorage(
      STORAGE_KEYS.YOUTUBE_PROGRESS,
      cleanedProgress,
      playlistProgressSchema,
      'local'
    );
  } catch (error) {
    logger.error('Error updating video progress', error);
    return storageFailure('Error updating video progress');
  }
}

export interface PlaylistResumeInfo {
  videoId: string;
  timestamp: number;
}

/**
 * Get the current video ID and timestamp for a playlist (last played video)
 * Returns both the videoId and timestamp to avoid multiple storage lookups
 */
export async function getCurrentVideoForPlaylist(
  playlistId: string
): Promise<PlaylistResumeInfo | null> {
  try {
    const allProgress = await getYoutubeProgress();
    const playlistProgress = allProgress.find((p) => p.playlistId === playlistId);

    if (!playlistProgress?.currentVideoId) {
      return null;
    }

    const videoProgress = playlistProgress.videoProgress.find(
      (v) => v.videoId === playlistProgress.currentVideoId
    );

    return {
      videoId: playlistProgress.currentVideoId,
      timestamp: videoProgress?.timestamp ?? 0,
    };
  } catch (error) {
    logger.error('Error getting current video for playlist', error);
    return null;
  }
}
