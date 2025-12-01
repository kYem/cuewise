/**
 * Chrome Storage API abstraction layer with TypeScript type safety
 */

import { logger } from '@cuewise/shared';

// Storage area type
type StorageArea = 'local' | 'sync';

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
 */
export async function setInStorage<T>(
  key: string,
  value: T,
  area: StorageArea = 'local'
): Promise<boolean> {
  try {
    // Check if chrome.storage is available
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const storage = area === 'local' ? chrome.storage.local : chrome.storage.sync;
      await storage.set({ [key]: value });
      return true;
    }

    // Fallback to localStorage for development
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    // Provide more specific error messages for quota errors
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('quota') || errorMessage.includes('QUOTA_BYTES')) {
      if (area === 'sync') {
        logger.error(
          `Chrome sync storage quota exceeded for key "${key}". ` +
            `Sync storage has a 100KB total limit and 8KB per-item limit. ` +
            `Consider disabling sync or reducing data size.`,
          error
        );
      } else {
        logger.error(
          `Chrome local storage quota exceeded for key "${key}". ` +
            `Local storage has a 10MB limit. Consider clearing old data.`,
          error
        );
      }
    } else {
      logger.error(`Error setting ${key} in ${area} storage`, error);
    }

    return false;
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
