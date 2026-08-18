import type { StorageError, StorageResult } from './types';

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

/**
 * Copy for a write that did not persist. A quota failure is not retryable, so the generic
 * "please try again" is worse than useless there — it sends the user round the same loop.
 * Reads the `StorageError` `assertPersisted` attaches as `cause`.
 */
export function storageWriteErrorMessage(error: unknown, fallback: string): string {
  // Either shape: the StorageError itself, or the Error `assertPersisted` wrapped it in.
  const candidate = error instanceof Error ? error.cause : error;
  const type = (candidate as StorageError | undefined)?.type;
  if (type === 'quota_exceeded' || type === 'per_item_quota_exceeded') {
    return 'Storage is full. Remove some quotes or free up space to continue.';
  }
  return fallback;
}
