// @cuewise/storage public API — explicit named exports (no wildcard barrels),
// so the surface is reviewable and can't leak internals or collide.

export {
  clearCustomBackground,
  clearDailyBackground,
  getCustomBackground,
  getDailyBackground,
  setCustomBackground,
  setDailyBackground,
} from './backgrounds';
// KeyValueStore adapters (implement the platform port)
export { ChromeKeyValueStore } from './chrome-key-value-store';
export type { StorageResult } from './chrome-storage';
// Low-level storage delegators over the platform port
export { getManyFromStorage, setManyInStorage } from './chrome-storage';
export { type CollectionLock, withCollectionLock } from './collection-lock';
export { getConceptCards, updateConceptCards } from './concept-cards';
export {
  getCalendarState,
  getPostureStats,
  getWeatherState,
  setCalendarState,
  setPostureStats,
  setWeatherState,
} from './device-state';
export { getGoals, getGoalsRaw, setGoals, setGoalsRaw, updateGoals } from './goals';
export {
  getHabitHistory,
  getHabitHistoryRaw,
  recordHabitDone,
  removeHabitDays,
  removeHabitDaysBefore,
  setHabitHistoryRaw,
} from './habit-history';
export { LocalStorageKeyValueStore } from './local-storage-key-value-store';
export {
  getPomodoroSessions,
  getPomodoroSessionsRaw,
  setPomodoroSessions,
  setPomodoroSessionsRaw,
} from './pomodoro-sessions';
export { getQuickLinks, setQuickLinks } from './quick-links';
export {
  getCollections,
  getCollectionsRaw,
  setCollections,
  setCollectionsRaw,
  updateCollections,
} from './quote-collections';
export {
  getCurrentQuote,
  getQuotes,
  getQuotesRaw,
  isCustomQuote,
  setCurrentQuote,
  setQuotes,
  setQuotesRaw,
  updateQuotes,
} from './quotes';
export {
  getReminders,
  getRemindersRaw,
  setReminders,
  setRemindersRaw,
  updateReminders,
} from './reminders';
export {
  clearSettings,
  ensureSettingsMigrated,
  getSettings,
  getSettingsForSync,
  getStoredSettingsKeys,
  readSettings,
  SETTINGS_KEY_PREFIX,
  SETTINGS_KEYS,
  type SettingsRead,
  setSettingsPatch,
  setSettingsPatchRaw,
  settingsStorageKey,
} from './settings';
export {
  formatBytes,
  getStorageUsage,
  migrateStorageData,
  type StorageUsageInfo,
} from './storage-usage';
export {
  getCurrentVideoForPlaylist,
  getCustomYoutubePlaylists,
  setCustomYoutubePlaylists,
  updateVideoProgress,
} from './youtube';
