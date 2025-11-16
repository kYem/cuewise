/**
 * Chrome Storage API abstraction layer with TypeScript type safety
 */

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
    console.error(`Error getting ${key} from storage:`, error);
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
    console.error(`Error setting ${key} in storage:`, error);
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
    console.error(`Error removing ${key} from storage:`, error);
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
    console.error('Error clearing storage:', error);
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
