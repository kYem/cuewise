import { ApiError } from '@cuewise/sync-client';
import { describe, expect, it } from 'vitest';
import {
  classifySyncFailure,
  parsePersistedSyncCycle,
  type SyncOutcome,
  toPersistedSyncCycle,
} from './sync-outcome';

describe('classifySyncFailure', () => {
  it('reads an exhausted-retry network error as network', () => {
    expect(classifySyncFailure(new ApiError('network_error', 0))).toBe('network');
  });

  it('reads any other api error as server', () => {
    expect(classifySyncFailure(new ApiError('internal', 500))).toBe('server');
    expect(classifySyncFailure(new ApiError('bad_request', 400))).toBe('server');
  });

  it('reads anything it does not recognise as device', () => {
    expect(classifySyncFailure(new Error('Could not determine the storage area'))).toBe('device');
    expect(classifySyncFailure('a bare string')).toBe('device');
    expect(classifySyncFailure(undefined)).toBe('device');
  });
});

describe('the persisted-cycle round trip', () => {
  const outcomes: SyncOutcome[] = [
    { kind: 'synced' },
    { kind: 'no-key' },
    { kind: 'signed-out' },
    { kind: 'resynced' },
    { kind: 'failed', reason: 'network', error: new Error('offline') },
  ];

  it.each(outcomes)('survives storage for $kind', (outcome) => {
    const stored = toPersistedSyncCycle({ at: 1_700_000_000_000, outcome });

    expect(parsePersistedSyncCycle(stored)).toEqual({
      at: 1_700_000_000_000,
      // The error is the one field a round trip cannot carry, so it comes back undefined.
      outcome: outcome.kind === 'failed' ? { ...outcome, error: undefined } : outcome,
    });
  });

  it('drops the error rather than storing a value no round trip could carry', () => {
    const stored = toPersistedSyncCycle({
      at: 1,
      outcome: { kind: 'failed', reason: 'device', error: new Error('unreadable') },
    });

    expect(stored).toEqual({ at: 1, kind: 'failed', reason: 'device' });
  });
});

describe('parsePersistedSyncCycle rejections', () => {
  it('rejects a null value without throwing on it', () => {
    expect(parsePersistedSyncCycle(null)).toBeNull();
  });

  it('rejects a kind this build does not know', () => {
    expect(parsePersistedSyncCycle({ at: 1, kind: 'throttled' })).toBeNull();
  });

  it('rejects a failure with no reason, which would render as an unknown one', () => {
    expect(parsePersistedSyncCycle({ at: 1, kind: 'failed' })).toBeNull();
  });

  it.each([
    ['a non-numeric timestamp', { at: 'ages ago', kind: 'synced' }],
    ['a non-finite timestamp', { at: Number.NaN, kind: 'synced' }],
    ['a missing timestamp', { kind: 'synced' }],
  ])('rejects %s', (_label, value) => {
    expect(parsePersistedSyncCycle(value)).toBeNull();
  });

  it('keeps a reason this build does not know, so a newer peer stays visible', () => {
    // Rejecting it would hide the failure itself — the UI falls back on the copy and logs the skew.
    expect(parsePersistedSyncCycle({ at: 1, kind: 'failed', reason: 'quota' })).toEqual({
      at: 1,
      outcome: { kind: 'failed', reason: 'quota', error: undefined },
    });
  });
});
