import type { StorageResult } from './types';

/** Build a failed StorageResult carrying a generic 'unknown' diagnostic. */
export function storageFailure(message: string): StorageResult {
  return { success: false, error: { type: 'unknown', message } };
}

// Adapters resolve {success: false} instead of rejecting — normalize to a throw
// for callers whose catch is the failure path. The StorageError rides as cause.
export function assertPersisted(result: StorageResult): void {
  if (result?.success === false) {
    throw new Error(result.error.message, { cause: result.error });
  }
}
