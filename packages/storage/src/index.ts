// @cuewise/storage public API — explicit named exports (no wildcard barrels),
// so the surface is reviewable and can't leak internals or collide.

// KeyValueStore adapters (implement the platform port)
export { ChromeKeyValueStore } from './chrome-key-value-store';
export type { StorageArea, StorageError, StorageErrorType, StorageResult } from './chrome-storage';
// Low-level storage delegators over the platform port
export { getFromStorage, removeFromStorage, setInStorage } from './chrome-storage';
export { LocalStorageKeyValueStore } from './local-storage-key-value-store';
export type { PlaylistResumeInfo, StorageUsageInfo } from './storage-helpers';
// Typed storage helpers
export {
  formatBytes,
  getCalendarState,
  getCollections,
  getConceptCards,
  getCurrentQuote,
  getCurrentVideoForPlaylist,
  getCustomYoutubePlaylists,
  getDailyBackground,
  getGoals,
  getPomodoroSessions,
  getQuickLinks,
  getQuotes,
  getReminders,
  getSettings,
  getStorageUsage,
  getYoutubeProgress,
  migrateStorageData,
  setCalendarState,
  setCollections,
  setConceptCards,
  setCurrentQuote,
  setCustomYoutubePlaylists,
  setDailyBackground,
  setGoals,
  setPomodoroSessions,
  setQuickLinks,
  setQuotes,
  setReminders,
  setSettings,
  updateVideoProgress,
} from './storage-helpers';
