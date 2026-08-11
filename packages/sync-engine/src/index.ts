import type { SyncEngine } from './engine';

// Re-exported so consumers can name these without a direct @cuewise/crypto dependency.
export {
  type PairingCommitment,
  RecoveryCodeError,
  type RecoveryCodeErrorKind,
} from '@cuewise/crypto';
// Re-exported so the approver UI (packages/app, which depends on sync-engine but not sync-client
// directly) can type listPairingRequests()'s result.
export type { PendingPairing } from '@cuewise/sync-client';
export {
  type CollectionBinding,
  DEVICE_LOCAL_SETTINGS_KEYS,
  defaultBindings,
} from './collections';
export { type CreateSyncEngineOptions, createSyncEngine } from './create-engine';
export {
  type CycleDeps,
  type PullResult,
  type PushResult,
  pullOnce,
  pushOnce,
  type SyncTransport,
} from './cycle';
export {
  CLOUD_SYNC_ENABLED_KEY,
  type EnableSyncOptions,
  type EngineApiClient,
  LAST_CYCLE_KEY,
  LAST_SYNCED_AT_KEY,
  type PairingApprovalResult,
  type PairingPollResult,
  RECOVERY_ENVELOPE_KEY,
  type RecoveryEnvelopeState,
  SyncEngine,
  type SyncEngineDeps,
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
>;
export {
  checkForLostDataKey,
  initOrEnrollKey,
  type KeyLifecycleDeps,
  type KeyTransport,
  loadPersistedDataKey,
  persistDataKey,
  RecoveryCodeRequiredError,
  SelfHealNeedsEnrollError,
  SYNC_DATA_KEY,
} from './key-lifecycle';
export { defaultMeta, SYNC_META_KEY, type SyncMeta, SyncMetadataStore } from './metadata-store';
export { MutationTracker } from './mutation-tracker';
export { fromSyncRecord, toPushRecord } from './record-map';
export {
  type ConflictStrategy,
  LwwHlcStrategy,
  type RecordBody,
  type Resolution,
} from './strategy';
export {
  classifySyncFailure,
  parsePersistedSyncCycle,
  type SyncCycle,
  type SyncCycleRead,
  type SyncFailureReason,
  type SyncNowResult,
  type SyncOutcome,
  toPersistedSyncCycle,
} from './sync-outcome';
