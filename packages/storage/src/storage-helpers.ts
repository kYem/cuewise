/**
 * Typed storage helpers for specific data types
 */

import {
  type CalendarState,
  type ConceptCard,
  calendarStateSchema,
  conceptCardSchema,
  DAY_IN_MS,
  type DailyBackground,
  DEFAULT_SETTINGS,
  dailyBackgroundSchema,
  type FocusImageCategory,
  type Goal,
  getStorage,
  getTodayDateString,
  goalSchema,
  logger,
  type PlaylistProgress,
  type PomodoroSession,
  type PostureDailyStat,
  playlistProgressSchema,
  pomodoroSessionSchema,
  postureDailyStatSchema,
  type QuickLink,
  type Quote,
  type QuoteCollection,
  quickLinkSchema,
  quoteCollectionSchema,
  quoteSchema,
  type Reminder,
  reminderSchema,
  type Settings,
  STORAGE_KEYS,
  settingsSchema,
  storageFailure,
  type WeatherState,
  weatherStateSchema,
  type YoutubePlaylist,
  youtubePlaylistSchema,
} from '@cuewise/shared';
import { z } from 'zod/mini';
import {
  getFromStorage,
  getValidatedFromStorage,
  getValidatedListFromStorage,
  removeFromStorage,
  type StorageResult,
  setInStorage,
} from './chrome-storage';

/**
 * Get the storage area based on user settings
 * Settings are always stored in local storage to avoid circular dependency
 */
async function getStorageArea(): Promise<'local' | 'sync'> {
  // Always use local for settings to avoid circular dependency
  const settings = await readStoredSettingsFields();
  const syncEnabled = settings.syncEnabled ?? DEFAULT_SETTINGS.syncEnabled;
  return syncEnabled ? 'sync' : 'local';
}

// Quotes - Hybrid Storage Strategy
// Seed quotes: Always stored in local storage (same on all devices)
// Custom quotes: Stored in sync/local based on user preference (user-created data)

/**
 * Check if a quote is a custom quote (user-created or modified seed quote)
 */
function isCustomQuote(quote: Quote): boolean {
  // Custom quotes have isCustom flag OR have been favorited/hidden (modified state)
  return quote.isCustom || quote.isFavorite || quote.isHidden;
}

/**
 * Migrate legacy quotes storage to hybrid storage
 * Called automatically when old 'quotes' key is detected
 */
async function migrateLegacyQuotes(): Promise<void> {
  try {
    // Check both storage areas for legacy quotes
    const localQuotes = await getValidatedListFromStorage<Quote>(
      STORAGE_KEYS.QUOTES,
      quoteSchema,
      'local'
    );
    const syncQuotes = await getValidatedListFromStorage<Quote>(
      STORAGE_KEYS.QUOTES,
      quoteSchema,
      'sync'
    );
    const legacyQuotes = localQuotes || syncQuotes;

    if (!legacyQuotes || legacyQuotes.length === 0) {
      return; // No migration needed
    }

    logger.info('Migrating legacy quotes to hybrid storage...');

    // Split into seed and custom quotes
    const seedQuotes = legacyQuotes.filter((q) => !isCustomQuote(q));
    const customQuotes = legacyQuotes.filter((q) => isCustomQuote(q));

    // Store seed quotes in local storage
    if (seedQuotes.length > 0) {
      await setInStorage(STORAGE_KEYS.SEED_QUOTES, seedQuotes, 'local');
    }

    // Store custom quotes in appropriate storage area
    if (customQuotes.length > 0) {
      const area = await getStorageArea();
      await setInStorage(STORAGE_KEYS.CUSTOM_QUOTES, customQuotes, area);
    }

    // Clean up legacy storage from both areas
    await removeFromStorage(STORAGE_KEYS.QUOTES, 'local');
    await removeFromStorage(STORAGE_KEYS.QUOTES, 'sync');

    logger.info(
      `Migration complete: ${seedQuotes.length} seed quotes, ${customQuotes.length} custom quotes`
    );
  } catch (error) {
    logger.error('Error migrating legacy quotes', error);
  }
}

export async function getQuotes(): Promise<Quote[]> {
  try {
    // Check if migration is needed
    const legacyQuotes = await getValidatedListFromStorage<Quote>(
      STORAGE_KEYS.QUOTES,
      quoteSchema,
      'local'
    );
    if (legacyQuotes && legacyQuotes.length > 0) {
      await migrateLegacyQuotes();
    }

    // Load seed quotes from local storage (always)
    const seedQuotes =
      (await getValidatedListFromStorage<Quote>(STORAGE_KEYS.SEED_QUOTES, quoteSchema, 'local')) ??
      [];

    // Load custom quotes from appropriate storage area
    const area = await getStorageArea();
    const customQuotes =
      (await getValidatedListFromStorage<Quote>(STORAGE_KEYS.CUSTOM_QUOTES, quoteSchema, area)) ??
      [];

    // Merge seed and custom quotes
    return [...seedQuotes, ...customQuotes];
  } catch (error) {
    logger.error('Error getting quotes', error);
    return [];
  }
}

export async function setQuotes(quotes: Quote[]): Promise<StorageResult> {
  try {
    // Split into seed and custom quotes
    const seedQuotes = quotes.filter((q) => !isCustomQuote(q));
    const customQuotes = quotes.filter((q) => isCustomQuote(q));

    // Store seed quotes in local storage
    const seedResult = await setInStorage(STORAGE_KEYS.SEED_QUOTES, seedQuotes, 'local');
    if (!seedResult.success) {
      return seedResult;
    }

    // Store custom quotes in appropriate storage area
    const area = await getStorageArea();
    const customResult = await setInStorage(STORAGE_KEYS.CUSTOM_QUOTES, customQuotes, area);

    return customResult;
  } catch (error) {
    logger.error('Error setting quotes', error);
    return storageFailure('Error setting quotes');
  }
}

export async function getCurrentQuote(): Promise<Quote | null> {
  const area = await getStorageArea();
  return getValidatedFromStorage<Quote>(STORAGE_KEYS.CURRENT_QUOTE, quoteSchema, area);
}

export async function setCurrentQuote(quote: Quote): Promise<StorageResult> {
  const area = await getStorageArea();
  return setInStorage(STORAGE_KEYS.CURRENT_QUOTE, quote, area);
}

// Goals
export async function getGoals(): Promise<Goal[]> {
  const area = await getStorageArea();
  const goals = await getValidatedListFromStorage<Goal>(STORAGE_KEYS.GOALS, goalSchema, area);
  return goals ?? [];
}

export async function setGoals(goals: Goal[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setInStorage(STORAGE_KEYS.GOALS, goals, area);
}

// Reminders
export async function getReminders(): Promise<Reminder[]> {
  const area = await getStorageArea();
  const reminders = await getValidatedListFromStorage<Reminder>(
    STORAGE_KEYS.REMINDERS,
    reminderSchema,
    area
  );
  return reminders ?? [];
}

export async function setReminders(reminders: Reminder[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setInStorage(STORAGE_KEYS.REMINDERS, reminders, area);
}

// Quote Collections
export async function getCollections(): Promise<QuoteCollection[]> {
  const area = await getStorageArea();
  const collections = await getValidatedListFromStorage<QuoteCollection>(
    STORAGE_KEYS.COLLECTIONS,
    quoteCollectionSchema,
    area
  );
  return collections ?? [];
}

export async function setCollections(collections: QuoteCollection[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setInStorage(STORAGE_KEYS.COLLECTIONS, collections, area);
}

// Quick Links (pinned shortcut tiles on the new tab)
export async function getQuickLinks(): Promise<QuickLink[]> {
  const area = await getStorageArea();
  const links = await getValidatedListFromStorage<QuickLink>(
    STORAGE_KEYS.QUICK_LINKS,
    quickLinkSchema,
    area
  );
  return links ?? [];
}

export async function setQuickLinks(links: QuickLink[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setInStorage(STORAGE_KEYS.QUICK_LINKS, links, area);
}

// Concept Cards (spaced-repetition learning cards)
export async function getConceptCards(): Promise<ConceptCard[]> {
  const area = await getStorageArea();
  const cards = await getValidatedListFromStorage<ConceptCard>(
    STORAGE_KEYS.CONCEPT_CARDS,
    conceptCardSchema,
    area
  );
  return cards ?? [];
}

export async function setConceptCards(cards: ConceptCard[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setInStorage(STORAGE_KEYS.CONCEPT_CARDS, cards, area);
}

// Posture daily rollups (macOS tracking; always local — device-specific data)
export async function getPostureStats(): Promise<PostureDailyStat[]> {
  const stats = await getValidatedListFromStorage<PostureDailyStat>(
    STORAGE_KEYS.POSTURE_STATS,
    postureDailyStatSchema,
    'local'
  );
  return stats ?? [];
}

export async function setPostureStats(stats: PostureDailyStat[]): Promise<StorageResult> {
  return setInStorage(STORAGE_KEYS.POSTURE_STATS, stats, 'local');
}

// Google Calendar (connection + cached events; always local)
export async function getCalendarState(): Promise<CalendarState | null> {
  return getValidatedFromStorage<CalendarState>(
    STORAGE_KEYS.CALENDAR,
    calendarStateSchema,
    'local'
  );
}

export async function setCalendarState(state: CalendarState): Promise<StorageResult> {
  return setInStorage(STORAGE_KEYS.CALENDAR, state, 'local');
}

// Always local, which is what makes the location per-device: a travelling laptop shows
// where it actually is.
export async function getWeatherState(): Promise<WeatherState | null> {
  return getValidatedFromStorage<WeatherState>(STORAGE_KEYS.WEATHER, weatherStateSchema, 'local');
}

export async function setWeatherState(state: WeatherState): Promise<StorageResult> {
  return setInStorage(STORAGE_KEYS.WEATHER, state, 'local');
}

// Pomodoro Sessions
export async function getPomodoroSessions(): Promise<PomodoroSession[]> {
  const area = await getStorageArea();
  const sessions = await getValidatedListFromStorage<PomodoroSession>(
    STORAGE_KEYS.POMODORO_SESSIONS,
    pomodoroSessionSchema,
    area
  );
  return sessions ?? [];
}

export async function setPomodoroSessions(sessions: PomodoroSession[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setInStorage(STORAGE_KEYS.POMODORO_SESSIONS, sessions, area);
}

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
  return setInStorage(STORAGE_KEYS.CUSTOM_YOUTUBE_PLAYLISTS, playlists, 'local');
}

// Settings
// Note: Settings are always stored in local storage to avoid circular dependency
/**
 * Settings is the one blob that must never be validated all-or-nothing.
 *
 * It is only rewritten when the user changes something, and there is no upgrade migration,
 * so a blob written by any earlier release legitimately lacks every field added since.
 * Rejecting the whole object would reset every preference on upgrade — including
 * `syncEnabled`, which decides the storage *area*, so the user's synced goals and quotes
 * would read as empty and the next write would persist that as fact.
 *
 * So each field is checked on its own: absent or unreadable ones fall back to their
 * default, and everything the user actually chose survives.
 */
async function readStoredSettingsFields(): Promise<Partial<Settings>> {
  const raw = await getFromStorage<unknown>(STORAGE_KEYS.SETTINGS, 'local');
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const stored = raw as Record<string, unknown>;
  const shape = settingsSchema.def.shape;
  // Seeded with the keys this build has never heard of, so validating stays a check rather
  // than an edit. Dropping them would delete a setting a newer build wrote, and the store
  // rewrites the whole object on the next change — the same silent loss the read path
  // avoids for every other blob.
  const kept: Record<string, unknown> = Object.fromEntries(
    Object.entries(stored).filter(([key]) => !(key in shape))
  );
  const dropped: string[] = [];
  for (const [key, fieldSchema] of Object.entries(shape)) {
    const value = stored[key];
    if (value === undefined) {
      continue;
    }
    if (fieldSchema.safeParse(value).success) {
      kept[key] = value;
    } else {
      dropped.push(key);
    }
  }
  if (dropped.length > 0) {
    // Names only — a setting's value can be a goal id or a playlist the user picked.
    logger.warn('Ignored unreadable settings fields, using their defaults', { fields: dropped });
  }
  return kept as Partial<Settings>;
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await readStoredSettingsFields()) };
}

/**
 * Null when nothing was ever stored. For destructive automation that must fail closed,
 * which is why this reports absence rather than defaults — but a blob missing only fields
 * added since it was written is present, not absent.
 */
export async function getStoredSettings(): Promise<Settings | null> {
  const raw = await getFromStorage<unknown>(STORAGE_KEYS.SETTINGS, 'local');
  if (raw === null) {
    return null;
  }
  return { ...DEFAULT_SETTINGS, ...(await readStoredSettingsFields()) };
}

export async function setSettings(settings: Settings): Promise<StorageResult> {
  return setInStorage(STORAGE_KEYS.SETTINGS, settings, 'local');
}

// Storage usage tracking
export interface StorageUsageInfo {
  bytesInUse: number;
  quota: number;
  percentageUsed: number;
  isWarning: boolean; // > 75%
  isCritical: boolean; // > 90%
}

/**
 * Storage usage (bytes + quota) from the active KeyValueStore backend for the
 * user's area, plus warning/critical thresholds. In the extension that's
 * chrome.storage (100KB sync / 10MB local); in dev it's the localStorage estimate.
 */
export async function getStorageUsage(): Promise<StorageUsageInfo> {
  try {
    const area = await getStorageArea();
    const { bytesInUse, quota } = await getStorage().getUsage(area);
    let percentageUsed = 0;
    if (quota > 0) {
      percentageUsed = (bytesInUse / quota) * 100;
    }

    return {
      bytesInUse,
      quota,
      percentageUsed,
      isWarning: percentageUsed > 75,
      isCritical: percentageUsed > 90,
    };
  } catch (error) {
    logger.error('Error getting storage usage', error);
    // Return safe defaults on error (assume local storage)
    return {
      bytesInUse: 0,
      quota: 10485760,
      percentageUsed: 0,
      isWarning: false,
      isCritical: false,
    };
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * Migrate data between storage areas (local <-> sync)
 * Used when user toggles the syncEnabled setting
 *
 * Note: Seed quotes always stay in local storage.
 * Only custom quotes and user data are migrated.
 */
export async function migrateStorageData(
  fromArea: 'local' | 'sync',
  toArea: 'local' | 'sync'
): Promise<StorageResult> {
  try {
    // Raw reads, deliberately. Migration moves bytes between areas — it never renders
    // anything — and a validated read would turn an unreadable blob into `[]`, which the
    // unconditional writes below would then copy over live data in the destination. The
    // read paths still validate on the way out, so a bad blob stays quarantined, not erased.
    const customQuotes =
      (await getFromStorage<Quote[]>(STORAGE_KEYS.CUSTOM_QUOTES, fromArea)) ?? [];
    const currentQuote = await getFromStorage<Quote>(STORAGE_KEYS.CURRENT_QUOTE, fromArea);
    const goals = (await getFromStorage<Goal[]>(STORAGE_KEYS.GOALS, fromArea)) ?? [];
    const reminders = (await getFromStorage<Reminder[]>(STORAGE_KEYS.REMINDERS, fromArea)) ?? [];
    const sessions =
      (await getFromStorage<PomodoroSession[]>(STORAGE_KEYS.POMODORO_SESSIONS, fromArea)) ?? [];
    const collections =
      (await getFromStorage<QuoteCollection[]>(STORAGE_KEYS.COLLECTIONS, fromArea)) ?? [];
    const quickLinks =
      (await getFromStorage<QuickLink[]>(STORAGE_KEYS.QUICK_LINKS, fromArea)) ?? [];
    const conceptCards =
      (await getFromStorage<ConceptCard[]>(STORAGE_KEYS.CONCEPT_CARDS, fromArea)) ?? [];

    // Copy data to destination storage area
    // Note: Seed quotes are not migrated (always in local storage)
    const results: StorageResult[] = [];

    results.push(await setInStorage(STORAGE_KEYS.CUSTOM_QUOTES, customQuotes, toArea));
    if (currentQuote) {
      results.push(await setInStorage(STORAGE_KEYS.CURRENT_QUOTE, currentQuote, toArea));
    }
    results.push(await setInStorage(STORAGE_KEYS.GOALS, goals, toArea));
    results.push(await setInStorage(STORAGE_KEYS.REMINDERS, reminders, toArea));
    results.push(await setInStorage(STORAGE_KEYS.POMODORO_SESSIONS, sessions, toArea));
    results.push(await setInStorage(STORAGE_KEYS.COLLECTIONS, collections, toArea));
    results.push(await setInStorage(STORAGE_KEYS.QUICK_LINKS, quickLinks, toArea));
    results.push(await setInStorage(STORAGE_KEYS.CONCEPT_CARDS, conceptCards, toArea));

    // Check if any operation failed
    const failedResult = results.find((r) => !r.success);
    if (failedResult) {
      return failedResult;
    }

    logger.info(`Successfully migrated data from ${fromArea} to ${toArea}`);
    logger.info(
      `Migrated ${customQuotes.length} custom quotes (seed quotes remain in local storage)`
    );
    return { success: true };
  } catch (error) {
    logger.error(`Error migrating data from ${fromArea} to ${toArea}`, error);
    return storageFailure(`Error migrating data from ${fromArea} to ${toArea}`);
  }
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

    return setInStorage(STORAGE_KEYS.YOUTUBE_PROGRESS, cleanedProgress, 'local');
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

// Daily Background (persisted to change only once per day)
// Note: Daily background is stored in local storage only (not synced)

/**
 * Get the daily background image data
 * Returns null if no background is stored or if the stored background is from a different day
 */
export async function getDailyBackground(
  category: FocusImageCategory
): Promise<DailyBackground | null> {
  try {
    const background = await getValidatedFromStorage<DailyBackground>(
      STORAGE_KEYS.DAILY_BACKGROUND,
      dailyBackgroundSchema,
      'local'
    );

    if (!background) {
      return null;
    }

    // Check if the background is from today and matches the category
    const today = getTodayDateString();
    if (background.date === today && background.category === category) {
      return background;
    }

    // Background is stale (different day or category)
    return null;
  } catch (error) {
    logger.error('Error getting daily background', error);
    return null;
  }
}

/**
 * Save the daily background image data
 */
export async function setDailyBackground(
  url: string,
  category: FocusImageCategory
): Promise<StorageResult> {
  try {
    const background: DailyBackground = {
      url,
      category,
      date: getTodayDateString(),
    };

    return setInStorage(STORAGE_KEYS.DAILY_BACKGROUND, background, 'local');
  } catch (error) {
    logger.error('Error setting daily background', error);
    return storageFailure('Error setting daily background');
  }
}

/** The user's own background as a data URL; null when unset or unreadable. */
export async function getCustomBackground(): Promise<string | null> {
  try {
    return await getValidatedFromStorage<string>(
      STORAGE_KEYS.CUSTOM_BACKGROUND,
      z.string(),
      'local'
    );
  } catch (error) {
    logger.error('Error getting custom background', error);
    return null;
  }
}

/** Always check `success` — a large image can exceed the quota. */
export async function setCustomBackground(dataUrl: string): Promise<StorageResult> {
  try {
    return await setInStorage(STORAGE_KEYS.CUSTOM_BACKGROUND, dataUrl, 'local');
  } catch (error) {
    logger.error('Error setting custom background', error);
    return storageFailure('Error setting custom background');
  }
}

/** Always check `success` — on failure the image is still on the device and will return. */
export async function clearCustomBackground(): Promise<StorageResult> {
  try {
    const removed = await removeFromStorage(STORAGE_KEYS.CUSTOM_BACKGROUND, 'local');
    if (!removed) {
      return storageFailure('Could not remove the custom background');
    }
    return { success: true };
  } catch (error) {
    logger.error('Error clearing custom background', error);
    return storageFailure('Error clearing custom background');
  }
}
