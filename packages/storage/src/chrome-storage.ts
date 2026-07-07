/**
 * Storage helpers — thin delegators over the platform KeyValueStore.
 *
 * A capability-detected backend self-registers on load (chrome.storage in the
 * extension, localStorage under the vite dev server), so importing
 * @cuewise/storage needs no bootstrap. A Tauri app calls
 * `configurePlatform({ storage: new TauriKeyValueStore() })` after imports to
 * override it.
 */

import type { KeyValueStore, StorageArea, StorageResult } from '@cuewise/shared';
import { configurePlatform, getStorage } from '@cuewise/shared';
import { ChromeKeyValueStore } from './chrome-key-value-store';
import { LocalStorageKeyValueStore } from './local-storage-key-value-store';

// Re-export storage types for existing importers of './chrome-storage'.
export type { StorageArea, StorageError, StorageErrorType, StorageResult } from '@cuewise/shared';

const defaultStore: KeyValueStore =
  typeof chrome !== 'undefined' && chrome.storage
    ? new ChromeKeyValueStore()
    : new LocalStorageKeyValueStore();
configurePlatform({ storage: defaultStore });

export async function getFromStorage<T>(
  key: string,
  area: StorageArea = 'local'
): Promise<T | null> {
  return getStorage().get<T>(key, area);
}

export async function setInStorage<T>(
  key: string,
  value: T,
  area: StorageArea = 'local'
): Promise<StorageResult> {
  return getStorage().set(key, value, area);
}

export async function removeFromStorage(
  key: string,
  area: StorageArea = 'local'
): Promise<boolean> {
  return getStorage().remove(key, area);
}
