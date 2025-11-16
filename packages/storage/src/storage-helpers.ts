/**
 * Typed storage helpers for specific data types
 */

import {
  DEFAULT_SETTINGS,
  type Goal,
  type PomodoroSession,
  type Quote,
  type Reminder,
  type Settings,
  STORAGE_KEYS,
} from '@cuewise/shared';
import { getFromStorage, setInStorage } from './chrome-storage';

/**
 * Get the storage area based on user settings
 * Settings are always stored in local storage to avoid circular dependency
 */
async function getStorageArea(): Promise<'local' | 'sync'> {
  // Always use local for settings to avoid circular dependency
  const settings = await getFromStorage<Settings>(STORAGE_KEYS.SETTINGS, 'local');
  const syncEnabled = settings?.syncEnabled ?? DEFAULT_SETTINGS.syncEnabled;
  return syncEnabled ? 'sync' : 'local';
}

// Quotes
export async function getQuotes(): Promise<Quote[]> {
  const area = await getStorageArea();
  const quotes = await getFromStorage<Quote[]>(STORAGE_KEYS.QUOTES, area);
  return quotes ?? [];
}

export async function setQuotes(quotes: Quote[]): Promise<boolean> {
  const area = await getStorageArea();
  return setInStorage(STORAGE_KEYS.QUOTES, quotes, area);
}

export async function getCurrentQuote(): Promise<Quote | null> {
  const area = await getStorageArea();
  return getFromStorage<Quote>(STORAGE_KEYS.CURRENT_QUOTE, area);
}

export async function setCurrentQuote(quote: Quote): Promise<boolean> {
  const area = await getStorageArea();
  return setInStorage(STORAGE_KEYS.CURRENT_QUOTE, quote, area);
}

// Goals
export async function getGoals(): Promise<Goal[]> {
  const area = await getStorageArea();
  const goals = await getFromStorage<Goal[]>(STORAGE_KEYS.GOALS, area);
  return goals ?? [];
}

export async function setGoals(goals: Goal[]): Promise<boolean> {
  const area = await getStorageArea();
  return setInStorage(STORAGE_KEYS.GOALS, goals, area);
}

// Reminders
export async function getReminders(): Promise<Reminder[]> {
  const area = await getStorageArea();
  const reminders = await getFromStorage<Reminder[]>(STORAGE_KEYS.REMINDERS, area);
  return reminders ?? [];
}

export async function setReminders(reminders: Reminder[]): Promise<boolean> {
  const area = await getStorageArea();
  return setInStorage(STORAGE_KEYS.REMINDERS, reminders, area);
}

// Pomodoro Sessions
export async function getPomodoroSessions(): Promise<PomodoroSession[]> {
  const area = await getStorageArea();
  const sessions = await getFromStorage<PomodoroSession[]>(STORAGE_KEYS.POMODORO_SESSIONS, area);
  return sessions ?? [];
}

export async function setPomodoroSessions(sessions: PomodoroSession[]): Promise<boolean> {
  const area = await getStorageArea();
  return setInStorage(STORAGE_KEYS.POMODORO_SESSIONS, sessions, area);
}

// Settings
// Note: Settings are always stored in local storage to avoid circular dependency
export async function getSettings(): Promise<Settings> {
  const settings = await getFromStorage<Settings>(STORAGE_KEYS.SETTINGS, 'local');
  return settings ?? DEFAULT_SETTINGS;
}

export async function setSettings(settings: Settings): Promise<boolean> {
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
 * Get storage usage information
 * Uses chrome.storage.sync or chrome.storage.local based on user settings
 * - Chrome.storage.sync quota: 100KB (102400 bytes), max 512 items, 8KB per item
 * - Chrome.storage.local quota: 10MB (10485760 bytes)
 */
export async function getStorageUsage(): Promise<StorageUsageInfo> {
  try {
    // Check if chrome.storage is available (extension context)
    if (typeof chrome === 'undefined' || !chrome.storage) {
      // Dev mode: estimate localStorage usage
      let bytesInUse = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          bytesInUse += key.length + (value?.length || 0);
        }
      }
      // localStorage quota is typically 5-10MB
      const QUOTA_BYTES = 5242880; // 5MB in bytes
      const percentageUsed = (bytesInUse / QUOTA_BYTES) * 100;

      return {
        bytesInUse,
        quota: QUOTA_BYTES,
        percentageUsed,
        isWarning: percentageUsed > 75,
        isCritical: percentageUsed > 90,
      };
    }

    // Determine which storage area to check based on user settings
    const area = await getStorageArea();
    const isSync = area === 'sync';

    // Chrome storage quotas differ by storage type
    const QUOTA_BYTES = isSync ? 102400 : 10485760; // 100KB for sync, 10MB for local

    // Get bytes in use from Chrome storage
    const storage = isSync ? chrome.storage.sync : chrome.storage.local;
    const bytesInUse = await new Promise<number>((resolve) => {
      storage.getBytesInUse(null, (bytes) => {
        resolve(bytes);
      });
    });

    const percentageUsed = (bytesInUse / QUOTA_BYTES) * 100;

    return {
      bytesInUse,
      quota: QUOTA_BYTES,
      percentageUsed,
      isWarning: percentageUsed > 75,
      isCritical: percentageUsed > 90,
    };
  } catch (error) {
    console.error('Error getting storage usage:', error);
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
 */
export async function migrateStorageData(fromArea: 'local' | 'sync', toArea: 'local' | 'sync'): Promise<boolean> {
  try {
    // Get all data from source storage area
    const quotes = await getFromStorage<Quote[]>(STORAGE_KEYS.QUOTES, fromArea) ?? [];
    const currentQuote = await getFromStorage<Quote>(STORAGE_KEYS.CURRENT_QUOTE, fromArea);
    const goals = await getFromStorage<Goal[]>(STORAGE_KEYS.GOALS, fromArea) ?? [];
    const reminders = await getFromStorage<Reminder[]>(STORAGE_KEYS.REMINDERS, fromArea) ?? [];
    const sessions = await getFromStorage<PomodoroSession[]>(STORAGE_KEYS.POMODORO_SESSIONS, fromArea) ?? [];

    // Copy data to destination storage area
    await setInStorage(STORAGE_KEYS.QUOTES, quotes, toArea);
    if (currentQuote) {
      await setInStorage(STORAGE_KEYS.CURRENT_QUOTE, currentQuote, toArea);
    }
    await setInStorage(STORAGE_KEYS.GOALS, goals, toArea);
    await setInStorage(STORAGE_KEYS.REMINDERS, reminders, toArea);
    await setInStorage(STORAGE_KEYS.POMODORO_SESSIONS, sessions, toArea);

    console.log(`Successfully migrated data from ${fromArea} to ${toArea}`);
    return true;
  } catch (error) {
    console.error(`Error migrating data from ${fromArea} to ${toArea}:`, error);
    return false;
  }
}
