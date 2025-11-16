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

// Quotes
export async function getQuotes(): Promise<Quote[]> {
  const quotes = await getFromStorage<Quote[]>(STORAGE_KEYS.QUOTES);
  return quotes ?? [];
}

export async function setQuotes(quotes: Quote[]): Promise<boolean> {
  return setInStorage(STORAGE_KEYS.QUOTES, quotes);
}

export async function getCurrentQuote(): Promise<Quote | null> {
  return getFromStorage<Quote>(STORAGE_KEYS.CURRENT_QUOTE);
}

export async function setCurrentQuote(quote: Quote): Promise<boolean> {
  return setInStorage(STORAGE_KEYS.CURRENT_QUOTE, quote);
}

// Goals
export async function getGoals(): Promise<Goal[]> {
  const goals = await getFromStorage<Goal[]>(STORAGE_KEYS.GOALS);
  return goals ?? [];
}

export async function setGoals(goals: Goal[]): Promise<boolean> {
  return setInStorage(STORAGE_KEYS.GOALS, goals);
}

// Reminders
export async function getReminders(): Promise<Reminder[]> {
  const reminders = await getFromStorage<Reminder[]>(STORAGE_KEYS.REMINDERS);
  return reminders ?? [];
}

export async function setReminders(reminders: Reminder[]): Promise<boolean> {
  return setInStorage(STORAGE_KEYS.REMINDERS, reminders);
}

// Pomodoro Sessions
export async function getPomodoroSessions(): Promise<PomodoroSession[]> {
  const sessions = await getFromStorage<PomodoroSession[]>(STORAGE_KEYS.POMODORO_SESSIONS);
  return sessions ?? [];
}

export async function setPomodoroSessions(sessions: PomodoroSession[]): Promise<boolean> {
  return setInStorage(STORAGE_KEYS.POMODORO_SESSIONS, sessions);
}

// Settings
export async function getSettings(): Promise<Settings> {
  const settings = await getFromStorage<Settings>(STORAGE_KEYS.SETTINGS);
  return settings ?? DEFAULT_SETTINGS;
}

export async function setSettings(settings: Settings): Promise<boolean> {
  return setInStorage(STORAGE_KEYS.SETTINGS, settings);
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
 * Get storage usage information for Chrome local storage
 * Chrome.storage.local quota is 10MB (10485760 bytes)
 */
export async function getStorageUsage(): Promise<StorageUsageInfo> {
  try {
    // Chrome storage quota for local storage is 10MB
    const QUOTA_BYTES = 10485760; // 10MB in bytes

    // Get bytes in use from Chrome storage
    const bytesInUse = await new Promise<number>((resolve) => {
      chrome.storage.local.getBytesInUse(null, (bytes) => {
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
    // Return safe defaults on error
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
