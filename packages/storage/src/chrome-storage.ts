/**
 * Chrome Storage API abstraction layer with TypeScript type safety
 */

import { logger } from '@cuewise/shared';

// Storage area type
type StorageArea = 'local' | 'sync';

/**
 * Storage operation result with detailed error information
 */
export interface StorageResult {
  success: boolean;
  error?: StorageError;
}

/**
 * Storage error types for more specific error handling
 */
export type StorageErrorType = 'quota_exceeded' | 'per_item_quota_exceeded' | 'unknown';

export interface StorageError {
  type: StorageErrorType;
  message: string;
  key: string;
  area: StorageArea;
}

/**
 * Get data from Chrome storage
 * Falls back to localStorage in development when chrome.storage is unavailable
 */
export async function getFromStorage<T>(
  key: string,
  area: StorageArea = 'local'
): Promise<T | null> {
  try {
    // Check if chrome.storage is available
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const storage = area === 'local' ? chrome.storage.local : chrome.storage.sync;
      const result = await storage.get(key);
      return (result[key] as T) ?? null;
    }

    // Fallback to localStorage for development
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (error) {
    logger.error(`Error getting ${key} from storage`, error);
    return null;
  }
}

/**
 * Set data in Chrome storage
 * Falls back to localStorage in development when chrome.storage is unavailable
 *
 * @returns StorageResult with success status and detailed error information
 */
export async function setInStorage<T>(
  key: string,
  value: T,
  area: StorageArea = 'local'
): Promise<StorageResult> {
  try {
    // Check if chrome.storage is available
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const storage = area === 'local' ? chrome.storage.local : chrome.storage.sync;
      await storage.set({ [key]: value });
      return { success: true };
    }

    // Fallback to localStorage for development
    localStorage.setItem(key, JSON.stringify(value));
    return { success: true };
  } catch (error) {
    // Provide more specific error messages for quota errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isQuotaError = errorMessage.includes('quota') || errorMessage.includes('QUOTA_BYTES');
    const isPerItemQuota = errorMessage.includes('kQuotaBytesPerItem');

    let storageError: StorageError;

    if (isQuotaError) {
      if (area === 'sync') {
        const errorType: StorageErrorType = isPerItemQuota
          ? 'per_item_quota_exceeded'
          : 'quota_exceeded';
        const message = isPerItemQuota
          ? `Data for "${key}" exceeds the 8KB per-item limit for Chrome sync storage. Consider disabling sync or clearing old data.`
          : `Chrome sync storage quota exceeded (100KB total limit). Consider disabling sync or clearing old data.`;

        logger.error(message, error);
        storageError = { type: errorType, message, key, area };
      } else {
        const message = `Chrome local storage quota exceeded for key "${key}" (10MB limit). Consider clearing old data.`;
        logger.error(message, error);
        storageError = { type: 'quota_exceeded', message, key, area };
      }
    } else {
      const message = `Error saving ${key} to storage`;
      logger.error(message, error);
      storageError = { type: 'unknown', message, key, area };
    }

    return { success: false, error: storageError };
  }
}

/**
 * Remove data from Chrome storage
 */
export async function removeFromStorage(
  key: string,
  area: StorageArea = 'local'
): Promise<boolean> {
  try {
    const storage = area === 'local' ? chrome.storage.local : chrome.storage.sync;
    await storage.remove(key);
    return true;
  } catch (error) {
    logger.error(`Error removing ${key} from storage`, error);
    return false;
  }
}

/**
 * Clear all data from Chrome storage
 */
export async function clearStorage(area: StorageArea = 'local'): Promise<boolean> {
  try {
    const storage = area === 'local' ? chrome.storage.local : chrome.storage.sync;
    await storage.clear();
    return true;
  } catch (error) {
    logger.error('Error clearing storage', error);
    return false;
  }
}

/**
 * Listen to storage changes
 */
export function onStorageChange(
  callback: (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => void
): void {
  chrome.storage.onChanged.addListener(callback);
}

/**
 * Remove storage change listener
 */
export function removeStorageChangeListener(
  callback: (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => void
): void {
  chrome.storage.onChanged.removeListener(callback);
}
