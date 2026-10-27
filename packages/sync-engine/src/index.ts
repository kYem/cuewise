import type { SyncEngine } from './engine';

// Re-exported so consumers can name these without a direct @cuewise/crypto dependency.
export { type PairingCommitment, RecoveryCodeError } from '@cuewise/crypto';
// Re-exported so the approver UI (packages/app, which depends on sync-engine but not sync-client
// directly) can type listPairingRequests()'s result.
export type { PendingPairing } from '@cuewise/sync-client';
export { createSyncEngine } from './create-engine';
export {
  CLOUD_SYNC_ENABLED_KEY,
  type DeleteAccountResult,
  type PairingApprovalResult,
  type PairingPollResult,
  type RecoveryEnvelopeState,
  SyncEngine,
  type SyncSignInProvider,
  type SyncStatus,
} from './engine';

/** Structural subset of SyncEngine that host control surfaces (SW/macOS) drive. */
export type SyncEngineControlSurface = Pick<
  SyncEngine,
  | 'enableSync'
  | 'resumeEnrollWithCode'
  | 'beginPairing'
  | 'pollPairing'
  | 'listPairingRequests'
  | 'commitPairing'
  | 'pollApproval'
  | 'approvePairing'
  | 'denyPairing'
  | 'disableSync'
  | 'regenerateRecoveryCode'
  | 'syncNow'
  | 'getStatus'
  | 'getAccount'
  | 'getLastSyncedAt'
  | 'getLastCycle'
  | 'getRecoveryEnvelope'
  | 'refreshRecoveryEnvelope'
  | 'ensureHydrated'
  | 'listSessions'
  | 'revokeSession'
  | 'renameSession'
  | 'revokeOtherSessions'
  | 'deleteAccount'
>;
export { RecoveryCodeRequiredError } from './key-lifecycle';
export type { SyncFailureReason, SyncNowResult, SyncOutcome } from './sync-outcome';
