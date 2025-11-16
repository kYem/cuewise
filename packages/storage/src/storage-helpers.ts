/**
 * Typed storage helpers for specific data types
 */

import {
  DEFAULT_SETTINGS,
  type Goal,
  type PomodoroSession,
  type PomodoroState,
  type Quote,
  type Reminder,
  type Settings,
  STORAGE_KEYS,
} from '@cuewise/shared';
import { getFromStorage, removeFromStorage, setInStorage } from './chrome-storage';

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
    const localQuotes = await getFromStorage<Quote[]>(STORAGE_KEYS.QUOTES, 'local');
    const syncQuotes = await getFromStorage<Quote[]>(STORAGE_KEYS.QUOTES, 'sync');
    const legacyQuotes = localQuotes || syncQuotes;

    if (!legacyQuotes || legacyQuotes.length === 0) {
      return; // No migration needed
    }

    console.log('Migrating legacy quotes to hybrid storage...');

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

    console.log(`Migration complete: ${seedQuotes.length} seed quotes, ${customQuotes.length} custom quotes`);
  } catch (error) {
    console.error('Error migrating legacy quotes:', error);
  }
}

export async function getQuotes(): Promise<Quote[]> {
  try {
    // Check if migration is needed
    const legacyQuotes = await getFromStorage<Quote[]>(STORAGE_KEYS.QUOTES, 'local');
    if (legacyQuotes && legacyQuotes.length > 0) {
      await migrateLegacyQuotes();
    }

    // Load seed quotes from local storage (always)
    const seedQuotes = (await getFromStorage<Quote[]>(STORAGE_KEYS.SEED_QUOTES, 'local')) ?? [];

    // Load custom quotes from appropriate storage area
    const area = await getStorageArea();
    const customQuotes = (await getFromStorage<Quote[]>(STORAGE_KEYS.CUSTOM_QUOTES, area)) ?? [];

    // Merge seed and custom quotes
    return [...seedQuotes, ...customQuotes];
  } catch (error) {
    console.error('Error getting quotes:', error);
    return [];
  }
}

export async function setQuotes(quotes: Quote[]): Promise<boolean> {
  try {
    // Split into seed and custom quotes
    const seedQuotes = quotes.filter((q) => !isCustomQuote(q));
    const customQuotes = quotes.filter((q) => isCustomQuote(q));

    // Store seed quotes in local storage
    const seedSuccess = await setInStorage(STORAGE_KEYS.SEED_QUOTES, seedQuotes, 'local');

    // Store custom quotes in appropriate storage area
    const area = await getStorageArea();
    const customSuccess = await setInStorage(STORAGE_KEYS.CUSTOM_QUOTES, customQuotes, area);

    return seedSuccess && customSuccess;
  } catch (error) {
    console.error('Error setting quotes:', error);
    return false;
  }
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

// Pomodoro active state (persisted to local storage for faster access)
export async function getPomodoroState(): Promise<PomodoroState | null> {
  const state = await getFromStorage<PomodoroState>(STORAGE_KEYS.POMODORO_STATE, 'local');
  return state;
}

export async function setPomodoroState(state: PomodoroState | null): Promise<boolean> {
  return setInStorage(STORAGE_KEYS.POMODORO_STATE, state, 'local');
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
 *
 * Note: Seed quotes always stay in local storage.
 * Only custom quotes and user data are migrated.
 */
export async function migrateStorageData(fromArea: 'local' | 'sync', toArea: 'local' | 'sync'): Promise<boolean> {
  try {
    // Get user data from source storage area
    const customQuotes = await getFromStorage<Quote[]>(STORAGE_KEYS.CUSTOM_QUOTES, fromArea) ?? [];
    const currentQuote = await getFromStorage<Quote>(STORAGE_KEYS.CURRENT_QUOTE, fromArea);
    const goals = await getFromStorage<Goal[]>(STORAGE_KEYS.GOALS, fromArea) ?? [];
    const reminders = await getFromStorage<Reminder[]>(STORAGE_KEYS.REMINDERS, fromArea) ?? [];
    const sessions = await getFromStorage<PomodoroSession[]>(STORAGE_KEYS.POMODORO_SESSIONS, fromArea) ?? [];

    // Copy data to destination storage area
    // Note: Seed quotes are not migrated (always in local storage)
    await setInStorage(STORAGE_KEYS.CUSTOM_QUOTES, customQuotes, toArea);
    if (currentQuote) {
      await setInStorage(STORAGE_KEYS.CURRENT_QUOTE, currentQuote, toArea);
    }
    await setInStorage(STORAGE_KEYS.GOALS, goals, toArea);
    await setInStorage(STORAGE_KEYS.REMINDERS, reminders, toArea);
    await setInStorage(STORAGE_KEYS.POMODORO_SESSIONS, sessions, toArea);

    console.log(`Successfully migrated data from ${fromArea} to ${toArea}`);
    console.log(`Migrated ${customQuotes.length} custom quotes (seed quotes remain in local storage)`);
    return true;
  } catch (error) {
    console.error(`Error migrating data from ${fromArea} to ${toArea}:`, error);
    return false;
  }
}
