import { configurePlatform, type KeyValueStore, type Scheduler } from '@cuewise/shared';
import { ApiClient, type ApiClientOptions, SessionManager } from '@cuewise/sync-client';
import type { CollectionBinding } from './collections';
import { SyncEngine, type SyncStatus } from './engine';
import type { ConflictStrategy } from './strategy';

export interface CreateSyncEngineOptions {
  baseUrl: string;
  keyStore: KeyValueStore;
  scheduler: Scheduler;
  fetchFn?: ApiClientOptions['fetchFn'];
  sleep?: ApiClientOptions['sleep'];
  strategy?: ConflictStrategy;
  bindings?: CollectionBinding[];
  now?: () => number;
  onStatus?: (status: SyncStatus) => void;
  onQuarantine?: (key: string) => void;
  onRecoveryCode?: (code: string) => void;
}

/**
 * One-call construction for hosts (extension service worker, Tauri app loop): wires
 * ApiClient + SessionManager + SyncEngine over the same keyStore so callers don't
 * have to know the internal dependency graph. See package CLAUDE.md for host wiring.
 */
export function createSyncEngine(opts: CreateSyncEngineOptions): SyncEngine {
  const sessionManager = new SessionManager(opts.keyStore);
  const apiClient = new ApiClient({
    baseUrl: opts.baseUrl,
    getToken: () => sessionManager.getToken(),
    fetchFn: opts.fetchFn,
    sleep: opts.sleep,
  });
  const engine = new SyncEngine({
    apiClient,
    sessionManager,
    keyStore: opts.keyStore,
    scheduler: opts.scheduler,
    strategy: opts.strategy,
    bindings: opts.bindings,
    now: opts.now,
    onStatus: opts.onStatus,
    onQuarantine: opts.onQuarantine,
    onRecoveryCode: opts.onRecoveryCode,
  });
  // Constructing the engine IS wiring it — hosts can no longer forget the manual
  // setSyncEngine() step. SyncEngine's markMutated/markMutatedBulk/markDeleted
  // structurally satisfy SyncMutationSink, so no adapter is needed here.
  configurePlatform({ syncSink: engine });
  return engine;
}
