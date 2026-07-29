import { ApiError } from '@cuewise/sync-client';

export type SyncFailureReason = 'network' | 'server' | 'device';

/** What one cycle did. `failed` carries the original error so the caller can log it. */
export type SyncOutcome =
  | { kind: 'synced' }
  | { kind: 'no-key' }
  | { kind: 'signed-out' }
  | { kind: 'resynced' }
  | { kind: 'failed'; reason: SyncFailureReason; error: unknown };

/**
 * Only the transient class is identified positively; anything unrecognised is `device`, which the
 * UI presents as persistent. Defaulting the other way promises a recovery that may never come.
 */
export function classifySyncFailure(error: unknown): SyncFailureReason {
  if (error instanceof ApiError) {
    if (error.code === 'network_error') {
      return 'network';
    }
    return 'server';
  }
  return 'device';
}
