import { vi } from 'vitest';
import type { SyncStatus } from '../engine';
import type { SyncEngineControlSurface } from '../index';

/**
 * A stubbed SyncEngineControlSurface for tests that drive a host adapter without a real engine.
 * Lives here rather than per-app because both adapters implement the same port: adding a method to
 * it should be one edit, not one per app per call site.
 *
 * Defaults describe an enrolled, healthy, never-yet-synced device — override only what the test is
 * about. `getLastCycle` returns the three-state read, so `{known:true, cycle:null}` is "no cycle has
 * run" and is NOT the same as `{known:false}` ("could not be read").
 */
export function fakeControlSurface(
  overrides: Partial<SyncEngineControlSurface> = {}
): SyncEngineControlSurface {
  return {
    enableSync: vi.fn().mockResolvedValue(undefined),
    disableSync: vi.fn().mockResolvedValue(undefined),
    resumeEnrollWithCode: vi.fn().mockResolvedValue(undefined),
    regenerateRecoveryCode: vi.fn().mockResolvedValue('CW1-NEW00-00000-00000-00000-00000-00000'),
    syncNow: vi.fn().mockResolvedValue({ kind: 'synced' }),
    getStatus: vi.fn().mockReturnValue('active' as SyncStatus),
    getAccount: vi.fn().mockResolvedValue(null),
    getLastSyncedAt: vi.fn().mockReturnValue(null),
    getLastCycle: vi.fn().mockReturnValue({ known: true, cycle: null }),
    getRecoveryEnvelope: vi.fn().mockReturnValue('present'),
    refreshRecoveryEnvelope: vi.fn().mockResolvedValue('present'),
    ensureHydrated: vi.fn().mockResolvedValue(undefined),
    listSessions: vi.fn().mockResolvedValue([]),
    revokeSession: vi.fn().mockResolvedValue(undefined),
    renameSession: vi.fn().mockResolvedValue(undefined),
    revokeOtherSessions: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}
