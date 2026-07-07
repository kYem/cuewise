import type { StorageResult } from './types';

/** Build a failed StorageResult carrying a generic 'unknown' diagnostic. */
export function storageFailure(message: string): StorageResult {
  return { success: false, error: { type: 'unknown', message } };
}
