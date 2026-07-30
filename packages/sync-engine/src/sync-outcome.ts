import { ApiError } from '@cuewise/sync-client';

export type SyncFailureReason = 'network' | 'server' | 'device';

/** What one cycle did. `failed` carries the original error so the caller can log it. */
export type SyncOutcome =
  | { kind: 'synced' }
  | { kind: 'no-key' }
  | { kind: 'signed-out' }
  | { kind: 'resynced' }
  | { kind: 'failed'; reason: SyncFailureReason; error: unknown };

/** One cycle plus when it ran. A cycle hydrated from storage carries no `error` — see below. */
export interface SyncCycle {
  at: number;
  outcome: SyncOutcome;
}

/**
 * The engine's answer about its last cycle. `{known:false}` is NOT `{known:true, cycle:null}`: the
 * stored record exists but could not be read (failed read, unreadable value, unparseable shape),
 * and only the latter means "no cycle has run". Hosts must map `{known:false}` to their own
 * unavailable value — reporting it as "none ran" is what clears a wedged device's badge.
 */
export type SyncCycleRead =
  | { readonly known: true; readonly cycle: SyncCycle | null }
  | { readonly known: false };

/**
 * What a cycle leaves for the next process. Deliberately without the `error`: it does not survive
 * a storage round trip, and syncNow logged the real object while it still had it.
 */
export interface PersistedSyncCycle {
  at: number;
  kind: SyncOutcome['kind'];
  reason?: SyncFailureReason;
}

export function toPersistedSyncCycle(cycle: SyncCycle): PersistedSyncCycle {
  if (cycle.outcome.kind === 'failed') {
    return { at: cycle.at, kind: 'failed', reason: cycle.outcome.reason };
  }
  return { at: cycle.at, kind: cycle.outcome.kind };
}

/**
 * Rebuilds a stored record, or null for anything that is not one: a blob written by another build
 * sails through a cast and then speaks for a cycle nothing here ever ran.
 */
export function parsePersistedSyncCycle(value: unknown): SyncCycle | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Partial<PersistedSyncCycle>;
  if (typeof record.at !== 'number' || !Number.isFinite(record.at)) {
    return null;
  }
  const outcome = storedOutcome(record);
  if (outcome === null) {
    return null;
  }
  return { at: record.at, outcome };
}

function storedOutcome(record: Partial<PersistedSyncCycle>): SyncOutcome | null {
  if (record.kind === 'failed') {
    if (typeof record.reason !== 'string') {
      return null;
    }
    // An unrecognised reason is kept rather than rejected: the UI already falls back on one, and
    // dropping the record would hide the failure itself.
    return { kind: 'failed', reason: record.reason, error: undefined };
  }
  if (record.kind === 'synced') {
    return { kind: 'synced' };
  }
  if (record.kind === 'no-key') {
    return { kind: 'no-key' };
  }
  if (record.kind === 'signed-out') {
    return { kind: 'signed-out' };
  }
  if (record.kind === 'resynced') {
    return { kind: 'resynced' };
  }
  return null;
}

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
