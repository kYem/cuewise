import type { SyncEngine } from './engine';

// Re-exported so hosts (macOS/extension DirectSyncController) can match enableSync's thrown-error
// contract without taking a direct @cuewise/crypto dependency of their own.
export { RecoveryCodeError, type RecoveryCodeErrorKind } from '@cuewise/crypto';
export {
  type CollectionBinding,
  DEVICE_LOCAL_SETTINGS_KEYS,
  defaultBindings,
} from './collections';
export { type CreateSyncEngineOptions, createSyncEngine } from './create-engine';
export { type CycleDeps, pullOnce, pushOnce, type SyncTransport } from './cycle';
export {
  CLOUD_SYNC_ENABLED_KEY,
  type EnableSyncOptions,
  type EngineApiClient,
  LAST_SYNCED_AT_KEY,
  SyncEngine,
  type SyncEngineDeps,
  type SyncSignInProvider,
  type SyncStatus,
} from './engine';

/** Structural subset of SyncEngine that host control surfaces (SW/macOS) drive. */
export type SyncEngineControlSurface = Pick<
  SyncEngine,
  | 'enableSync'
  | 'disableSync'
  | 'regenerateRecoveryCode'
  | 'syncNow'
  | 'getStatus'
  | 'getAccount'
  | 'getLastSyncedAt'
>;
export {
  initOrEnrollKey,
  type KeyLifecycleDeps,
  type KeyTransport,
  loadPersistedDataKey,
  RecoveryCodeRequiredError,
  SelfHealNeedsEnrollError,
  SelfHealUnrecoverableError,
  SYNC_DATA_KEY,
  selfHealKeyBlob,
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
