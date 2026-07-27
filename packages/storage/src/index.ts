// @cuewise/storage public API — explicit named exports (no wildcard barrels),
// so the surface is reviewable and can't leak internals or collide.

// KeyValueStore adapters (implement the platform port)
export { ChromeKeyValueStore } from './chrome-key-value-store';
export type { StorageArea, StorageError, StorageErrorType, StorageResult } from './chrome-storage';
// Low-level storage delegators over the platform port
export {
  getFromStorage,
  getManyFromStorage,
  removeFromStorage,
  removeManyFromStorage,
  setInStorage,
  setManyInStorage,
} from './chrome-storage';
export { LocalStorageKeyValueStore } from './local-storage-key-value-store';
export type { PlaylistResumeInfo, StorageUsageInfo } from './storage-helpers';
// Typed storage helpers
export {
  clearCustomBackground,
  clearSettings,
  formatBytes,
  getCalendarState,
  getCollections,
  getConceptCards,
  getCurrentQuote,
  getCurrentVideoForPlaylist,
  getCustomBackground,
  getCustomYoutubePlaylists,
  getDailyBackground,
  getGoals,
  getPomodoroSessions,
  getPostureStats,
  getQuickLinks,
  getQuotes,
  getReminders,
  getSettings,
  getStorageUsage,
  getStoredSettings,
  getWeatherState,
  getYoutubeProgress,
  migrateLegacySettings,
  migrateStorageData,
  SETTINGS_KEY_PREFIX,
  SETTINGS_KEYS,
  setCalendarState,
  setCollections,
  setConceptCards,
  setCurrentQuote,
  setCustomBackground,
  setCustomYoutubePlaylists,
  setDailyBackground,
  setGoals,
  setPomodoroSessions,
  setPostureStats,
  setQuickLinks,
  setQuotes,
  setReminders,
  setSettingsPatch,
  settingsStorageKey,
  setWeatherState,
  updateVideoProgress,
} from './storage-helpers';
