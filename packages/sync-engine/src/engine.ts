import {
  type DataKey,
  deriveMasterKey,
  generateRecoveryCode,
  RecoveryCodeError,
  wrapDataKey,
} from '@cuewise/crypto';
import { type KeyValueStore, logger, type Scheduler } from '@cuewise/shared';
import {
  ApiError,
  armSyncPull,
  type ExchangeTokenRequest,
  type ApiClient as RealApiClient,
  type SessionManager,
  SYNC_PULL_WAKE_ID,
} from '@cuewise/sync-client';
import { type CollectionBinding, defaultBindings } from './collections';
import { type CycleDeps, pullOnce, pushOnce } from './cycle';
import {
  initOrEnrollKey,
  type KeyLifecycleDeps,
  loadPersistedDataKey,
  RecoveryCodeRequiredError,
  SelfHealNeedsEnrollError,
  SelfHealUnrecoverableError,
  SYNC_DATA_KEY,
  selfHealKeyBlob,
} from './key-lifecycle';
import { SyncMetadataStore } from './metadata-store';
import { MutationTracker } from './mutation-tracker';
import { type ConflictStrategy, LwwHlcStrategy } from './strategy';

export const CLOUD_SYNC_ENABLED_KEY = 'cloudSyncEnabled';

/** Millis timestamp of the last successful sync cycle; survives restarts for the details UI. */
export const LAST_SYNCED_AT_KEY = 'cuewise.sync.lastSyncedAt';

// The periodic pull backstop cadence (spec §3: "~5 min"); foreground opens trigger sooner via syncNow.
const PULL_REARM_MINUTES = 5;

// Auth providers the enable flow can exchange for a session. Apple isn't in the type yet only
// because no client-side Apple bounce driver exists — the enableSync/codeVerifier plumbing it
// needs is already in place (the macOS google flow uses it).
export type SyncSignInProvider = 'dev' | 'google';

export interface EnableSyncOptions {
  /** Enrolls this device with an existing account's recovery code (device #2+). */
  recoveryCode?: string;
  /** PKCE verifier when the credential is a bounced one-time code (macOS google deep-link flow). */
  codeVerifier?: string;
}

export type SyncStatus =
  | 'disabled'
  | 'signing_in'
  | 'key_init'
  | 'enrolling'
  | 'initial_sync'
  | 'active'
  | 'signed_out'
  | 'error';

/**
 * Structural subset of ApiClient the engine needs (auth + the pull/push + key-envelope calls).
 * A real ApiClient instance satisfies this directly; tests supply an in-memory fake.
 */
export type EngineApiClient = Pick<
  RealApiClient,
  | 'exchangeToken'
  | 'getChanges'
  | 'pushChanges'
  | 'getRecoveryEnvelope'
  | 'putRecoveryEnvelope'
  | 'getAccount'
>;

export interface SyncEngineDeps {
  apiClient: EngineApiClient;
  sessionManager: SessionManager;
  keyStore: KeyValueStore;
  scheduler: Scheduler;
  strategy?: ConflictStrategy;
  bindings?: CollectionBinding[];
  now?: () => number;
  onStatus?: (status: SyncStatus) => void;
  onQuarantine?: (key: string) => void;
  onRecoveryCode?: (code: string) => void;
}

/**
 * Top-level orchestration façade (ENG-45): enable/enroll, the migration backfill, the
 * pull-then-push cycle, and the pull-loop re-arm. See package CLAUDE.md for host wiring.
 */
export class SyncEngine {
  private readonly meta: SyncMetadataStore;
  private readonly tracker: MutationTracker;
  private readonly strategy: ConflictStrategy;
  private readonly bindings: CollectionBinding[];
  private readonly now: () => number;
  private status: SyncStatus = 'disabled';
  private dk: DataKey | null = null;
  private keyId: string | null = null;
  private lastSyncedAt: number | null = null;

  constructor(private readonly deps: SyncEngineDeps) {
    this.now = deps.now ?? Date.now;
    this.meta = new SyncMetadataStore(deps.keyStore);
    this.tracker = new MutationTracker(this.meta, this.now);
    this.strategy = deps.strategy ?? new LwwHlcStrategy();
    this.bindings = deps.bindings ?? defaultBindings();
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  /** DISABLED → SIGNING_IN → KEY_INIT/ENROLLING → INITIAL_SYNC → ACTIVE (spec §4). */
  async enableSync(
    provider: SyncSignInProvider,
    credential: string,
    deviceName: string,
    opts: EnableSyncOptions = {}
  ): Promise<void> {
    const { recoveryCode, codeVerifier } = opts;
    try {
      this.setStatus('signing_in');
      // A codeVerifier marks a bounced one-time code rather than an id token; of the providers
      // this engine accepts, only google has a bounce flow (dev never carries one).
      const request: ExchangeTokenRequest =
        provider === 'google' && codeVerifier !== undefined
          ? { provider, credential, deviceName, codeVerifier }
          : { provider, credential, deviceName };
      const { token } = await this.deps.apiClient.exchangeToken(request);
      const saved = await this.deps.sessionManager.saveToken(token);
      if (!saved.success) {
        throw new Error(`failed to persist sync session: ${saved.error.message}`);
      }
      await this.enrollAndActivate(recoveryCode);
    } catch (err) {
      await this.handleEnableError(err);
    }
  }

  /**
   * Finishes an enroll that stopped at needs-code WITHOUT re-authenticating (ENG-65): the
   * session from the interrupted enableSync is still live, so device #2 just supplies the
   * recovery code — no second browser bounce. No-ops to signed_out if that session has since
   * been lost (the caller must then re-authenticate).
   */
  async resumeEnrollWithCode(recoveryCode: string): Promise<void> {
    try {
      // Inside the try so a storage fault reading the token routes through handleEnableError
      // (status → error) like every other enroll failure, not out as a raw rejection.
      const token = await this.deps.sessionManager.getToken();
      if (token === null) {
        await this.handleAuthLoss();
        return;
      }
      await this.enrollAndActivate(recoveryCode);
    } catch (err) {
      await this.handleEnableError(err);
    }
  }

  /** The enroll → initial-sync → activate tail shared by enableSync and resumeEnrollWithCode. */
  private async enrollAndActivate(recoveryCode: string | undefined): Promise<void> {
    // A code is only passed when enrolling an additional device; brand-new enable passes none.
    this.setStatus(recoveryCode ? 'enrolling' : 'key_init');
    const enrolled = await initOrEnrollKey(this.keyDeps(), recoveryCode);
    this.dk = enrolled.dk;
    this.keyId = enrolled.keyId;
    if (enrolled.recoveryCodeToShow !== undefined) {
      this.deps.onRecoveryCode?.(enrolled.recoveryCodeToShow);
    }

    this.setStatus('initial_sync');
    await this.backfillDirty();
    await this.syncNow();
    if (this.status === 'signed_out') {
      // syncNow already ran handleAuthLoss (dropped the session, kept the DK) — enable didn't finish.
      return;
    }

    const enabledResult = await this.deps.keyStore.set(CLOUD_SYNC_ENABLED_KEY, true, 'local');
    if (!enabledResult.success) {
      throw new Error(`failed to persist cloudSyncEnabled: ${enabledResult.error.message}`);
    }
    this.setStatus('active');
    await this.armPullLoopUnlessSignedOut();
  }

  /** Shared enable/enroll error mapping: 401 → auth loss; recovery-code control-flow → disabled+rethrow. */
  private async handleEnableError(err: unknown): Promise<void> {
    if (err instanceof ApiError && err.status === 401) {
      await this.handleAuthLoss();
      return;
    }
    if (err instanceof RecoveryCodeRequiredError || err instanceof RecoveryCodeError) {
      // Expected enroll control-flow, not a failure — don't poison the persisted status other tabs read.
      this.setStatus('disabled');
      throw err;
    }
    this.setStatus('error');
    throw err;
  }

  /** Clears session + DK + the enabled flag + sync bookkeeping. Local domain data is untouched. */
  async disableSync(): Promise<void> {
    await this.stop();
    await this.deps.sessionManager.clear();
    await this.deps.keyStore.remove(SYNC_DATA_KEY, 'local');
    await this.deps.keyStore.remove(CLOUD_SYNC_ENABLED_KEY, 'local');
    await this.deps.keyStore.remove(LAST_SYNCED_AT_KEY, 'local');
    await this.resetMeta();
    this.dk = null;
    this.keyId = null;
    this.lastSyncedAt = null;
    this.setStatus('disabled');
  }

  /** Rotates the recovery code for the current data key; overwrites the server envelope. */
  async regenerateRecoveryCode(): Promise<string> {
    if (this.dk === null || this.keyId === null) {
      throw new Error('cannot regenerate recovery code without an active sync session');
    }
    const { code, secret } = await generateRecoveryCode();
    const mk = await deriveMasterKey(secret);
    const blob = await wrapDataKey(mk, this.dk, this.keyId);
    await this.deps.apiClient.putRecoveryEnvelope(blob);
    return code;
  }

  /** pullOnce then pushOnce. A no-op until a DK is held (never enabled, or self-heal hasn't run). */
  async syncNow(): Promise<void> {
    if (this.dk === null || this.keyId === null) {
      return;
    }
    const cycleDeps: CycleDeps = {
      transport: this.deps.apiClient,
      meta: this.meta,
      bindings: this.bindings,
      dk: this.dk,
      keyId: this.keyId,
      strategy: this.strategy,
      now: this.now,
      onQuarantine: this.deps.onQuarantine,
    };
    try {
      await pullOnce(cycleDeps);
      await pushOnce(cycleDeps);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await this.handleAuthLoss();
        return;
      }
      throw err;
    }
    await this.stampLastSynced();
  }

  /**
   * Stamped only after a full successful cycle. A persistence failure is non-fatal by design: the
   * cycle already succeeded, and the in-memory stamp above is what the UI reads this session — only
   * next-launch hydration of "Last synced" is lost. The cause goes in the message text so it
   * survives string-coercing surfaces (Chrome's Errors panel); the error object carries the stack.
   */
  private async stampLastSynced(): Promise<void> {
    this.lastSyncedAt = this.now();
    const result = await this.deps.keyStore.set(LAST_SYNCED_AT_KEY, this.lastSyncedAt, 'local');
    if (!result.success) {
      logger.warn(`Failed to persist lastSyncedAt: ${result.error.message}`, {
        error: result.error,
      });
    }
  }

  getLastSyncedAt(): number | null {
    return this.lastSyncedAt;
  }

  /**
   * Account details for the settings UI. Informational only: resolves null when signed out
   * or on any fetch failure (including 401 — no auth-loss side effects), never throws.
   */
  async getAccount(): Promise<{ userId: string; email: string | null } | null> {
    // The token read sits inside the try so the never-throws contract holds by construction,
    // not by the current storage adapters happening to swallow their own errors.
    try {
      const token = await this.deps.sessionManager.getToken();
      if (token === null) {
        return null;
      }
      return await this.deps.apiClient.getAccount();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.warn(`Failed to fetch sync account details: ${detail}`);
      return null;
    }
  }

  /** Self-heal, then hold the DK and arm the pull loop. No-op if sync was never enabled here. */
  async start(): Promise<void> {
    const enabled = await this.deps.keyStore.get<boolean>(CLOUD_SYNC_ENABLED_KEY, 'local');
    if (enabled !== true) {
      return;
    }

    // Hydrate the details-UI timestamp so a restart shows the last real sync, not a blank.
    const persistedLastSynced = await this.deps.keyStore.get<number>(LAST_SYNCED_AT_KEY, 'local');
    if (typeof persistedLastSynced === 'number') {
      this.lastSyncedAt = persistedLastSynced;
    }

    try {
      await selfHealKeyBlob(this.keyDeps());
    } catch (err) {
      if (err instanceof SelfHealNeedsEnrollError || err instanceof SelfHealUnrecoverableError) {
        logger.warn('Sync self-heal requires the recovery code; staying signed out', {
          reason: err.name,
        });
        this.setStatus('signed_out');
        return;
      }
      throw err;
    }

    const persisted = await loadPersistedDataKey(this.deps.keyStore);
    if (persisted === null) {
      return;
    }

    this.dk = persisted.dk;
    this.keyId = persisted.keyId;
    this.setStatus('active');
    await this.syncNowLoopSafe();
    await this.armPullLoopUnlessSignedOut();
  }

  /** Cancels the armed pull wake. Does not touch session/keys — call disableSync() for that. */
  async stop(): Promise<void> {
    await this.deps.scheduler.cancel(SYNC_PULL_WAKE_ID);
  }

  /**
   * Host wiring: `armSyncPull` only schedules a single shot, so the host's
   * `SchedulerHost.onFire(id => { if (id === SYNC_PULL_WAKE_ID) engine.handlePullWake(); })`
   * must call this to run the cycle and re-arm the next wake. See package CLAUDE.md.
   */
  async handlePullWake(): Promise<void> {
    await this.syncNowLoopSafe();
    await this.armPullLoopUnlessSignedOut();
  }

  async markMutated(collection: string, entityId: string): Promise<void> {
    await this.tracker.markMutated(collection, entityId);
  }

  /** Bulk form of markMutated: one meta load/save for the whole id list, not one per id. */
  async markMutatedBulk(collection: string, entityIds: string[]): Promise<void> {
    await this.tracker.markMutatedBulk(collection, entityIds);
  }

  async markDeleted(collection: string, entityId: string): Promise<void> {
    await this.tracker.markDeleted(collection, entityId);
  }

  // LOOP callers must never let a transient failure (e.g. offline) kill the backstop poll
  // (spec §5). A 401 is handled inside syncNow itself (handleAuthLoss), never reaches this catch.
  private async syncNowLoopSafe(): Promise<void> {
    try {
      await this.syncNow();
    } catch (err) {
      logger.warn('Sync failed in the pull loop; the next scheduled wake will retry', {
        code: err instanceof ApiError ? err.code : undefined,
      });
    }
  }

  // handleAuthLoss already cancelled the wake; re-arming here would silently undo that.
  private async armPullLoopUnlessSignedOut(): Promise<void> {
    if (this.status === 'signed_out') {
      return;
    }
    await armSyncPull(this.deps.scheduler, PULL_REARM_MINUTES, this.now);
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
    this.deps.onStatus?.(status);
  }

  private keyDeps(): KeyLifecycleDeps {
    return { transport: this.deps.apiClient, keyStore: this.deps.keyStore };
  }

  // One markMutatedBulk call per collection instead of one markMutated per entity, so a
  // first-enable migration over an existing library does O(collections) meta saves, not O(entities).
  private async backfillDirty(): Promise<void> {
    for (const binding of this.bindings) {
      const all = await binding.readAll();
      const entityIds = Object.keys(all);
      if (entityIds.length === 0) {
        continue;
      }
      await this.tracker.markMutatedBulk(binding.name, entityIds);
    }
  }

  private async resetMeta(): Promise<void> {
    const meta = await this.meta.load();
    meta.cursor = 0;
    meta.dirty = {};
    meta.hlcs = {};
    meta.tombstones = [];
    meta.quarantine = [];
    await this.meta.save(meta);
  }

  // Auth 401 (spec §5): drop the session, stop the loop, keep local data + DK. User re-enables.
  private async handleAuthLoss(): Promise<void> {
    await this.deps.sessionManager.clear();
    await this.stop();
    this.setStatus('signed_out');
  }
}
