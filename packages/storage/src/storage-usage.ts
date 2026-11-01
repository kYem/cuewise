import { getStorage, logger, STORAGE_KEYS, storageFailure } from '@cuewise/shared';
import { getManyFromStorage, type StorageResult, setInStorage } from './chrome-storage';
import { getStorageArea } from './settings';

// Storage usage tracking. `available: false` is the only honest answer when the area is unknown:
// a sync user near the 100KB ceiling shown all-clear against 10MB loses the warning that
// explains their next failed write.
export type StorageUsageInfo =
  | {
      available: true;
      bytesInUse: number;
      quota: number;
      percentageUsed: number;
      isWarning: boolean; // > 75%
      isCritical: boolean; // > 90%
    }
  | { available: false };

/**
 * Storage usage (bytes + quota) from the active KeyValueStore backend for the
 * user's area, plus warning/critical thresholds. In the extension that's
 * chrome.storage (100KB sync / 10MB local); in dev it's the localStorage estimate.
 */
export async function getStorageUsage(): Promise<StorageUsageInfo> {
  try {
    const area = await getStorageArea();
    const { bytesInUse, quota } = await getStorage().getUsage(area);
    let percentageUsed = 0;
    if (quota > 0) {
      percentageUsed = (bytesInUse / quota) * 100;
    }

    return {
      available: true,
      bytesInUse,
      quota,
      percentageUsed,
      isWarning: percentageUsed > 75,
      isCritical: percentageUsed > 90,
    };
  } catch (error) {
    logger.error('Error getting storage usage', error);
    return { available: false };
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
export async function migrateStorageData(
  fromArea: 'local' | 'sync',
  toArea: 'local' | 'sync'
): Promise<StorageResult> {
  try {
    // Note: Seed quotes are not migrated (always in local storage)
    const keys = [
      STORAGE_KEYS.CUSTOM_QUOTES,
      STORAGE_KEYS.CURRENT_QUOTE,
      STORAGE_KEYS.GOALS,
      STORAGE_KEYS.REMINDERS,
      STORAGE_KEYS.POMODORO_SESSIONS,
      STORAGE_KEYS.COLLECTIONS,
      STORAGE_KEYS.QUICK_LINKS,
      STORAGE_KEYS.CONCEPT_CARDS,
    ];
    // One batch read, so "the source holds nothing here" is told apart from "the source could not
    // be read" — the second answered as the first copies emptiness over the destination.
    const source = await getManyFromStorage(keys, fromArea);
    if (source === null) {
      logger.error(`Could not read the ${fromArea} area; nothing was migrated`);
      return storageFailure(`Could not read the ${fromArea} storage area`);
    }
    const unreadable = keys.filter((key) => source[key]?.readable === false);
    if (unreadable.length > 0) {
      logger.error(`Refusing to migrate unreadable ${fromArea} data`, { keys: unreadable });
      return storageFailure(`Unreadable data in the ${fromArea} storage area: ${unreadable[0]}`);
    }

    // Only what the source actually holds: a key it never wrote has nothing to copy, and
    // writing `[]` for it would delete whatever the destination still has.
    const results: StorageResult[] = [];
    for (const key of keys) {
      const entry = source[key];
      if (entry?.readable === true) {
        results.push(await setInStorage(key, entry.value, toArea));
      }
    }

    // Check if any operation failed
    const failedResult = results.find((r) => !r.success);
    if (failedResult) {
      return failedResult;
    }

    logger.info(`Successfully migrated ${results.length} keys from ${fromArea} to ${toArea}`);
    return { success: true };
  } catch (error) {
    logger.error(`Error migrating data from ${fromArea} to ${toArea}`, error);
    return storageFailure(`Error migrating data from ${fromArea} to ${toArea}`);
  }
}
