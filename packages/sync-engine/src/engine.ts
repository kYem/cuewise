import {
  type DataKey,
  deriveMasterKey,
  generateRecoveryCode,
  RecoveryCodeError,
  wrapDataKey,
} from '@cuewise/crypto';
import { describeThrown, type KeyValueStore, logger, type Scheduler } from '@cuewise/shared';
import {
  ApiError,
  armSyncPull,
  type ExchangeTokenRequest,
  type ApiClient as RealApiClient,
  type SessionManager,
  SYNC_PULL_WAKE_ID,
} from '@cuewise/sync-client';
import { type CollectionBinding, defaultBindings } from './collections';
import { type CycleDeps, type PullResult, pullOnce, pushOnce } from './cycle';
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
import {
  classifySyncFailure,
  parsePersistedSyncCycle,
  type SyncCycle,
  type SyncOutcome,
  toPersistedSyncCycle,
} from './sync-outcome';

export const CLOUD_SYNC_ENABLED_KEY = 'cloudSyncEnabled';

/** Millis timestamp of the last successful sync cycle; survives restarts for the details UI. */
export const LAST_SYNCED_AT_KEY = 'cuewise.sync.lastSyncedAt';

/**
 * The last cycle's reduced record. Persisted for the same reason as the stamp above, and it matters
 * more: an MV3 worker is torn down between pull wakes, so an in-memory-only failure is gone by the
 * time the user opens Settings — leaving the hydrated "Last synced" as the only thing on screen.
 */
export const LAST_CYCLE_KEY = 'cuewise.sync.lastCycle';

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
 * The Error a stalled pull reports. A push error outranked by that stall goes in the MESSAGE text,
 * because `cause` is non-enumerable and any string-coercing or JSON-serialising log surface drops
 * it; `cause` still rides along for consoles that render it.
 */
function stallError(what: string, outrankedPush: { error: unknown } | undefined): Error {
  if (outrankedPush === undefined) {
    return new Error(what);
  }
  return new Error(
    `${what}; the same cycle's push also failed: ${describeThrown(outrankedPush.error)}`,
    {
      cause: outrankedPush.error,
    }
  );
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
  private lastCycle: SyncCycle | null = null;

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
    const outcome = await this.syncNow();
    if (outcome.kind === 'signed-out') {
      // The session was dropped mid-cycle (handleAuthLoss kept the DK) — enable didn't finish.
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
    await this.deps.keyStore.remove(LAST_CYCLE_KEY, 'local');
    await this.resetMeta();
    this.dk = null;
    this.keyId = null;
    this.lastSyncedAt = null;
    this.lastCycle = null;
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

  /**
   * pullOnce then pushOnce, reporting what the cycle actually did. Never throws — callers read
   * the outcome. A no-op until a DK is held (never enabled, or self-heal hasn't run).
   */
  async syncNow(): Promise<SyncOutcome> {
    const outcome = await this.runCycle();
    if (outcome.kind === 'signed-out') {
      await this.bestEffort(() => this.handleAuthLoss(), 'auth-loss cleanup');
    }
    if (outcome.kind === 'synced') {
      await this.bestEffort(() => this.stampLastSynced(), 'lastSyncedAt stamp');
    }
    if (outcome.kind === 'failed') {
      // Logged here, not per caller: this is the only place every caller passes through, and the
      // only one still holding the error itself (the page realm gets a serialized outcome). Reason
      // and cause go in the MESSAGE — `message` and `cause` are both non-enumerable, so an object
      // payload renders as `{}` on JSON surfaces and `[object Object]` on coercing ones.
      logger.error(
        `Sync cycle failed (${outcome.reason}); the next scheduled wake will retry: ${describeThrown(outcome.error)}`,
        outcome.error
      );
    }
    const cycle: SyncCycle = { at: this.now(), outcome };
    this.lastCycle = cycle;
    await this.bestEffort(() => this.persistLastCycle(cycle), 'last-cycle persist');
    return outcome;
  }

  /** The cycle proper: everything syncNow reports on, with none of the bookkeeping it does after. */
  private async runCycle(): Promise<SyncOutcome> {
    if (this.dk === null || this.keyId === null) {
      return { kind: 'no-key' };
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
    let pull: PullResult;
    try {
      pull = await pullOnce(cycleDeps);
    } catch (err) {
      return this.cycleFailure(err);
    }

    // Push still runs after a stalled pull — outbound changes must not be held hostage by an
    // inbound wedge — but the stall outranks a push error when reporting, because only the stall
    // describes what is actually wrong with this device. A 401 outranks both: it needs cleanup.
    // Boxed, not bare: a thrown `undefined` is still a push failure worth reporting.
    let outrankedPush: { error: unknown } | undefined;
    try {
      await pushOnce(cycleDeps);
    } catch (err) {
      const failure = this.cycleFailure(err);
      if (failure.kind === 'signed-out' || pull.kind !== 'stalled') {
        return failure;
      }
      outrankedPush = { error: err };
    }

    if (pull.kind === 'stalled') {
      // A clean transport and a parked cursor: every later remote change is unreachable on this
      // device until that write succeeds, so this is a failure however healthy the wire looked.
      return {
        kind: 'failed',
        reason: 'device',
        error: stallError(
          `sync pull stalled writing ${pull.collection}/${pull.entityId}`,
          outrankedPush
        ),
      };
    }
    return pull.kind === 'resynced' ? { kind: 'resynced' } : { kind: 'synced' };
  }

  /** Maps a thrown cycle error to its outcome: a 401 is auth loss, anything else is classified. */
  private cycleFailure(err: unknown): Extract<SyncOutcome, { kind: 'signed-out' | 'failed' }> {
    if (err instanceof ApiError && err.status === 401) {
      return { kind: 'signed-out' };
    }
    return { kind: 'failed', reason: classifySyncFailure(err), error: err };
  }

  /**
   * Runs one side effect whose failure must neither reject the caller nor skip the steps after it.
   * syncNow's never-throws contract and handleAuthLoss's always-lands-signed_out both hold by
   * construction this way, not by trusting adapters and host callbacks (a throwing onStatus would
   * otherwise escape to enableSync's catch and land an enrolled device on `error`).
   */
  private async bestEffort(step: () => Promise<void> | void, what: string): Promise<void> {
    try {
      await step();
    } catch (err) {
      logger.error(`Sync cycle ${what} failed; the reported outcome still stands`, { error: err });
    }
  }

  /**
   * Stamped only after a full successful cycle. A persistence failure is non-fatal by design: the
   * cycle already succeeded, and the in-memory stamp above is what the UI reads this session — only
   * next-launch hydration of "Last synced" is lost. The cause goes in the message text so it
   * survives string-coercing surfaces (Chrome's Errors panel); the context carries the structured
   * StorageError (plain data — there is no stack to keep).
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

  /**
   * Stored on every cycle, not only failures: a stale failure must not outlive the success that
   * followed it. Error-level on failure, unlike the stamp above — losing this record is what lets a
   * wedged device report nothing but "Last synced" after the next worker teardown.
   */
  private async persistLastCycle(cycle: SyncCycle): Promise<void> {
    const result = await this.deps.keyStore.set(
      LAST_CYCLE_KEY,
      toPersistedSyncCycle(cycle),
      'local'
    );
    if (!result.success) {
      logger.error(`Failed to persist the last sync cycle: ${result.error.message}`, result.error);
    }
  }

  getLastSyncedAt(): number | null {
    return this.lastSyncedAt;
  }

  /** The in-session answer carries the failure's `error`; one hydrated after a restart does not. */
  getLastCycle(): SyncCycle | null {
    return this.lastCycle;
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

    // And the cycle beside it, before this process runs one of its own: a control message answered
    // during start() must not report "no cycle" for a device that has been failing for an hour.
    const persistedCycle = await this.deps.keyStore.get<unknown>(LAST_CYCLE_KEY, 'local');
    if (persistedCycle !== null) {
      const hydrated = parsePersistedSyncCycle(persistedCycle);
      if (hydrated === null) {
        logger.error('The stored last sync cycle is not a cycle record; ignoring it', {
          key: LAST_CYCLE_KEY,
        });
      } else {
        this.lastCycle = hydrated;
      }
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
  // (spec §5). A 401 is handled inside syncNow itself (handleAuthLoss), and so is the failure log.
  private async syncNowLoopSafe(): Promise<void> {
    const outcome = await this.syncNow();
    if (outcome.kind === 'no-key') {
      logger.debug('Sync wake fired with no data key; nothing to do');
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
    // Status first, steps independent: a partial cleanup failure must never leave the engine
    // reporting health — armPullLoopUnlessSignedOut reads that status to decide whether to poll on.
    await this.bestEffort(() => this.setStatus('signed_out'), 'signed-out status notification');
    await this.bestEffort(() => this.deps.sessionManager.clear(), 'session clear');
    await this.bestEffort(() => this.stop(), 'pull-wake cancel');
  }
}
