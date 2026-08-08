import {
  type DataKey,
  deriveMasterKey,
  generateRecoveryCode,
  RecoveryCodeError,
  wrapDataKey,
} from '@cuewise/crypto';
import {
  describeThrown,
  type KeyValueStore,
  logger,
  type Scheduler,
  type StoredValue,
} from '@cuewise/shared';
import {
  ApiError,
  armSyncPull,
  type ExchangeTokenRequest,
  type ApiClient as RealApiClient,
  type SessionManager,
  SYNC_PULL_WAKE_ID,
  SYNC_SESSION_KEY,
} from '@cuewise/sync-client';
import { type CollectionBinding, defaultBindings } from './collections';
import { type CycleDeps, type PullResult, pullOnce, pushOnce } from './cycle';
import {
  checkForLostDataKey,
  initOrEnrollKey,
  type KeyLifecycleDeps,
  loadPersistedDataKey,
  RecoveryCodeRequiredError,
  SelfHealNeedsEnrollError,
  SYNC_DATA_KEY,
} from './key-lifecycle';
import { SyncMetadataStore } from './metadata-store';
import { MutationTracker } from './mutation-tracker';
import { type ConflictStrategy, LwwHlcStrategy } from './strategy';
import {
  classifySyncFailure,
  parsePersistedSyncCycle,
  type SyncCycle,
  type SyncCycleRead,
  type SyncNowResult,
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

/**
 * Whether the server holds a recovery envelope for this account. Persisted, not held per process:
 * the extension respawns its worker on every wake, so an in-memory answer would be recomputed —
 * and re-logged — every five minutes, and the panel reads this on a cold worker.
 */
export const RECOVERY_ENVELOPE_KEY = 'cuewise.sync.recoveryEnvelope';

// The periodic pull backstop cadence (spec §3: "~5 min"); foreground opens trigger sooner via syncNow.
const PULL_REARM_MINUTES = 5;

// A local edit should not wait for the five-minute wake to leave the device. setTimeout, not
// the Scheduler port: that port schedules OS wakes in minutes and cannot do seconds.
const PUSH_DEBOUNCE_MS = 2_000;
// So a continuous stream of edits still ships instead of resetting the debounce forever.
const PUSH_MAX_WAIT_MS = 10_000;

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
  // Enabled, but the key is gone. Unlike `signed_out`, re-authenticating alone cannot fix it.
  | 'needs_enroll'
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

/** Whether a hydration read may stay memoised; only an outright failure is worth re-reading. */
type HydrationResult = 'final' | 'retry';

/**
 * Names a rejected record's shape for the log without echoing it — the field names distinguish a
 * legacy shape from a partial write from garbage, and none of them carry user data.
 */
function describeShape(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return typeof value;
  }
  return `{${Object.keys(value).join(',')}}`;
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
  // False once a stored record turned out to be unreadable: that is not "no cycle ran", and
  // answering it as such is exactly what clears a wedged device's badge.
  private lastCycleKnown = true;
  // null until a check has answered once, so a panel on a cold worker cannot read "unknown" as
  // "missing" and claim an account has no recovery path before anything has checked.
  private recoveryEnvelope: boolean | null = null;
  // Chains every envelope read and write; see queueEnvelope.
  private envelopeQueue: Promise<unknown> = Promise.resolve();
  // Whether the enrol in flight minted a code. Never the code itself: this only decides whether the
  // "only way back" breadcrumb fires, and the value belongs to the host's one-shot slot.
  private enrollMintedCode = false;
  private hydration: Promise<void> | null = null;
  // The cancellation token for everything a disable must stop: the cycle, each enrol checkpoint,
  // start(), and any bookkeeping already in flight. Only disableSync bumps it, and only upward.
  private accountEpoch = 0;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pushDeadline: number | null = null;
  // A count, not a flag: syncNow is concurrently callable (explicit sync, pull wake, start), and a
  // second cycle finishing first would otherwise clear it while the first is still running.
  private cyclesInFlight = 0;

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
    // Before sign-in, not inside enrollAndActivate: a disable landing during the token exchange
    // would move the epoch before a later snapshot read it, and then match at every checkpoint.
    const epoch = this.accountEpoch;
    const before = this.status;
    // Per attempt: a previous enable's mint must not make this one's rollback claim a code.
    this.enrollMintedCode = false;
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
      await this.enrollAndActivate(recoveryCode, epoch);
    } catch (err) {
      await this.handleEnableError(err, before, epoch);
    }
  }

  /**
   * Finishes an enroll that stopped at needs-code WITHOUT re-authenticating (ENG-65): the
   * session from the interrupted enableSync is still live, so device #2 just supplies the
   * recovery code — no second browser bounce. No-ops to signed_out if that session has since
   * been lost (the caller must then re-authenticate).
   */
  async resumeEnrollWithCode(recoveryCode: string): Promise<void> {
    const epoch = this.accountEpoch;
    const before = this.status;
    try {
      // Inside the try so a storage fault reading the token routes through handleEnableError
      // (status → error) like every other enroll failure, not out as a raw rejection.
      const token = await this.deps.sessionManager.getToken();
      if (token === null) {
        // A disable is why the session is gone, and it has already cleared it: handleAuthLoss
        // would repaint the pill as "Sign-in expired" for a device the user disconnected.
        if (this.enrollSuperseded(epoch)) {
          return;
        }
        await this.handleAuthLoss();
        return;
      }
      await this.enrollAndActivate(recoveryCode, epoch);
    } catch (err) {
      await this.handleEnableError(err, before, epoch);
    }
  }

  /** The enroll → initial-sync → activate tail shared by enableSync and resumeEnrollWithCode. */
  private async enrollAndActivate(recoveryCode: string | undefined, epoch: number): Promise<void> {
    // A code is only passed when enrolling an additional device; brand-new enable passes none.
    this.setStatus(recoveryCode ? 'enrolling' : 'key_init');
    const wasEnabled = await this.deps.keyStore.get<boolean>(CLOUD_SYNC_ENABLED_KEY, 'local');
    // Queued, because initNewKey's envelope PUT happens in here.
    const enrolled = await this.queueEnvelope(() => initOrEnrollKey(this.keyDeps(), recoveryCode));
    if (enrolled.recoveryCodeToShow !== undefined) {
      if (wasEnabled === true) {
        // A fresh key on a device that was already enrolled: every record the old key sealed is now
        // unopenable, and other devices keep it. The user only sees an ordinary new-code modal.
        logger.error('Cloud sync minted a new data key for an already-enrolled device');
      }
      // Handed over before the guard below, not after — see abandonEnroll.
      this.enrollMintedCode = true;
      this.deps.onRecoveryCode?.(enrolled.recoveryCodeToShow);
    }
    // Before the key is adopted: everything past here writes for an account that is gone.
    if (this.enrollSuperseded(epoch)) {
      await this.abandonEnroll(enrolled.recoveryCodeToShow !== undefined);
      return;
    }
    this.dk = enrolled.dk;
    this.keyId = enrolled.keyId;
    // Both enrol paths prove one: initNewKey PUT it, enrollFromEnvelope unwrapped it. Without
    // this a freshly-connected device reads "unknown" until its next start().
    await this.recordRecoveryEnvelope(true, epoch);

    this.setStatus('initial_sync');
    // Unconditionally: the enabled flag survives handleAuthLoss, so its presence cannot mean the
    // cursor is this account's — a re-auth can land on another at the provider's chooser.
    await this.resetPullCursor();
    await this.backfillDirty();
    // backfillDirty wrote to the ledger disableSync had just cleared, so a disable landing across
    // it needs that reset repeating before this enroll walks away.
    if (this.enrollSuperseded(epoch)) {
      await this.bestEffort(() => this.resetMeta(), 'abandoned enroll ledger rollback');
      await this.abandonEnroll(enrolled.recoveryCodeToShow !== undefined);
      return;
    }
    const outcome = await this.syncNow();
    if (this.enrollSuperseded(epoch)) {
      await this.abandonEnroll(enrolled.recoveryCodeToShow !== undefined);
      return;
    }
    if (outcome.kind === 'signed-out') {
      return;
    }

    const enabledResult = await this.deps.keyStore.set(CLOUD_SYNC_ENABLED_KEY, true, 'local');
    if (!enabledResult.success) {
      throw new Error(`failed to persist cloudSyncEnabled: ${enabledResult.error.message}`);
    }
    // Re-checked after the write: the flag left set with no key makes the next start() demand a
    // recovery code for the account the user disconnected.
    if (this.enrollSuperseded(epoch)) {
      await this.rollbackKey(CLOUD_SYNC_ENABLED_KEY, 'its enabled flag', 'abandoned an enable');
      await this.abandonEnroll(enrolled.recoveryCodeToShow !== undefined);
      return;
    }
    this.setStatus('active');
    await this.armPullLoopUnlessOff();
  }

  /**
   * Removes one key an abandoned enroll wrote. `remove` reports failure by returning false rather
   * than throwing, so bestEffort alone would call a failed rollback a success — and a surviving
   * enabled flag lands the next start() on needs_enroll, demanding a code for a removed account.
   */
  private async rollbackKey(key: string, what: string, subject: string): Promise<void> {
    const removed = await this.bestEffortRemove(key);
    if (!removed) {
      logger.error(`Cloud sync ${subject} but could not remove ${what}: ${key}`);
    }
  }

  private async clearSessionSafely(): Promise<boolean> {
    try {
      return await this.deps.sessionManager.clear();
    } catch (err) {
      logger.error(`Cloud sync rollback threw clearing the session: ${describeThrown(err)}`, err);
      return false;
    }
  }

  // No shipped adapter throws here — both catch and return false — so this is for the next one.
  private async bestEffortRemove(key: string): Promise<boolean> {
    try {
      return await this.deps.keyStore.remove(key, 'local');
    } catch (err) {
      logger.error(`Cloud sync rollback threw removing ${key}: ${describeThrown(err)}`, err);
      return false;
    }
  }

  /**
   * Drops what an abandoned enroll persisted, adopted or not. The server envelope cannot be
   * withdrawn — there is no delete call — so a code it minted is the only way back into the
   * account it made, which is why that is reported rather than swallowed.
   */
  private async abandonEnroll(mintedACode: boolean): Promise<void> {
    // Redundant today — disableSync nulls these itself, and it always ran to move the epoch — but
    // held here so the method is a complete rollback rather than one that relies on its caller.
    this.dk = null;
    this.keyId = null;
    await this.rollbackKey(SYNC_DATA_KEY, 'its data key', 'abandoned an enable');
    // disableSync cleared the session before this enroll's saveToken wrote it, so a live token
    // for the disconnected account survives unless this removes it — and `clear` reports failure
    // by returning false, exactly as `remove` does.
    if (!(await this.clearSessionSafely())) {
      logger.error('Cloud sync abandoned an enable but could not clear its session');
    }
    if (mintedACode) {
      logger.error(
        'Cloud sync enable was abandoned after creating an account; its recovery code is the only way back into it'
      );
    }
  }

  /**
   * Shared enable/enroll error mapping: 401 → auth loss; recovery-code control-flow → the
   * pre-attempt status + rethrow. `before` must be read before enableSync's first setStatus.
   */
  private async handleEnableError(err: unknown, before: SyncStatus, epoch: number): Promise<void> {
    // First: disableSync clears the session, so an enroll caught mid-flight usually fails with a
    // 401 that is the user's own doing. handleAuthLoss would answer it with "Sign-in expired".
    if (this.enrollSuperseded(epoch)) {
      const expected =
        (err instanceof ApiError && err.status === 401) ||
        err instanceof RecoveryCodeRequiredError ||
        err instanceof RecoveryCodeError;
      if (!expected) {
        // Not the 401 the disable's own session clear provokes, so it is a real fault that the
        // abandoned enable would otherwise bury.
        logger.error(`Cloud sync enable failed as it was abandoned: ${describeThrown(err)}`, err);
      }
      // Through the same rollback: a throw partway can still have persisted the key — and can
      // still have minted a code, which the host surfaces from its own capture slot.
      await this.abandonEnroll(this.enrollMintedCode);
      return;
    }
    if (err instanceof ApiError && err.status === 401) {
      await this.handleAuthLoss();
      return;
    }
    if (err instanceof RecoveryCodeRequiredError || err instanceof RecoveryCodeError) {
      // Expected enroll control-flow, not a failure — don't poison the persisted status other tabs
      // read. Only a first enable begins at `disabled`; every other start means this device was
      // already set up, so 'off' would contradict the prompt that sent the user here.
      this.setStatus(before === 'disabled' ? 'disabled' : 'needs_enroll');
      throw err;
    }
    this.setStatus('error');
    throw err;
  }

  /**
   * Clears session + DK + the enabled flag + sync bookkeeping, and cancels a cycle in flight.
   * Local domain data is untouched.
   */
  async disableSync(): Promise<void> {
    // First, and synchronously: everything else here awaits, and a concurrent start() or cycle can
    // only be superseded by an epoch that has already moved when their own reads resolve.
    this.accountEpoch += 1;
    await this.stop();
    const survived: string[] = [];
    // Through clearSessionSafely, like abandonEnroll and handleAuthLoss: bare, a throwing adapter
    // rejects the whole disable and skips the survived-keys summary below.
    if (!(await this.clearSessionSafely())) {
      // The token is the one surviving key that is a live credential: it keeps isSignedIn() true
      // and getAccount() resolving the disconnected account.
      survived.push(SYNC_SESSION_KEY);
    }
    for (const key of [
      SYNC_DATA_KEY,
      CLOUD_SYNC_ENABLED_KEY,
      LAST_SYNCED_AT_KEY,
      LAST_CYCLE_KEY,
      RECOVERY_ENVELOPE_KEY,
    ]) {
      const removed = await this.deps.keyStore.remove(key, 'local');
      if (!removed) {
        survived.push(key);
      }
    }
    if (survived.length > 0) {
      // A surviving enabled flag re-activates sync on the next start(); a surviving stamp can be
      // hydrated onto whatever account comes next. Both outlast the account they describe.
      logger.error(`Disable could not remove every sync key: ${survived.join(', ')}`);
    }
    this.dk = null;
    this.keyId = null;
    this.lastSyncedAt = null;
    this.lastCycle = null;
    // After a disable "no cycle" is the truth, so an earlier unreadable record must stop
    // reporting unknown — otherwise a failed hydration outlives the account it described.
    this.lastCycleKnown = true;
    // Back to unknown, not present: it described the account just removed, and carrying it forward
    // would answer for whatever account connects next.
    this.recoveryEnvelope = null;
    this.hydration = null;
    this.setStatus('disabled');
    // Last, and best-effort: an unreadable ledger makes load() throw deterministically, and doing
    // this first left every reset above unrun — the keys gone, the pill still active, and the user
    // told to try a disable that had in fact already happened.
    await this.bestEffort(() => this.resetMeta(), 'disable metadata reset');
  }

  /** Rotates the recovery code for the current data key; overwrites the server envelope. */
  async regenerateRecoveryCode(): Promise<string> {
    const epoch = this.accountEpoch;
    // Captured, not re-read below: a disable landing across these awaits nulls the fields, and
    // the narrowing above survives an await even though the value does not.
    const dk = this.dk;
    const keyId = this.keyId;
    if (dk === null || keyId === null) {
      throw new Error('cannot regenerate recovery code without an active sync session');
    }
    const { code, secret } = await generateRecoveryCode();
    const mk = await deriveMasterKey(secret);
    const blob = await wrapDataKey(mk, dk, keyId);
    await this.queueEnvelope(async () => {
      await this.deps.apiClient.putRecoveryEnvelope(blob);
      // The one repair for a missing envelope, so this is what retires the badge it raised.
      await this.recordRecoveryEnvelope(true, epoch);
    });
    return code;
  }

  /**
   * pullOnce then pushOnce, reporting what the cycle actually did — or `cancelled` if a disable
   * landed inside it. Never throws: callers read the result. A no-op until a DK is held.
   */
  async syncNow(): Promise<SyncNowResult> {
    this.cyclesInFlight += 1;
    try {
      const epoch = this.accountEpoch;
      const outcome = await this.runCycle(epoch);
      // Both an abandoned cycle and a whole one for a removed account answer `cancelled`: the stamp
      // and the record below would re-create the very keys disableSync removed, and handleAuthLoss
      // would repaint the pill as "Sign-in expired" for a device the user deliberately disconnected.
      if (outcome.kind === 'cancelled' || this.accountEpoch !== epoch) {
        logger.debug(
          `Sync cycle result dropped: the account was disabled mid-cycle (${outcome.kind})`
        );
        return { kind: 'cancelled' };
      }
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
      // `no-key` means no cycle ran, so it must not speak for the last one that did. An MV3 alarm
      // registers before start() and can wake a cold worker ahead of the key load, and that no-op
      // would otherwise overwrite — durably — the failure the user needs to see.
      if (outcome.kind !== 'no-key') {
        const cycle: SyncCycle = { at: this.now(), outcome };
        this.lastCycle = cycle;
        this.lastCycleKnown = true;
        await this.bestEffort(() => this.persistLastCycle(cycle), 'last-cycle persist');
      }
      // Re-checked after those writes, not only before them: a disable landing inside one of them
      // would otherwise leave the removed account's stamp to be hydrated onto whatever comes next,
      // and hand the caller a `synced` to toast.
      if (this.accountEpoch !== epoch) {
        await this.rollbackCycleRecord();
        return { kind: 'cancelled' };
      }
      return outcome;
    } finally {
      this.cyclesInFlight -= 1;
    }
  }

  private async rollbackCycleRecord(): Promise<void> {
    this.lastSyncedAt = null;
    this.lastCycle = null;
    await this.rollbackKey(LAST_SYNCED_AT_KEY, 'the last-synced stamp', 'retired a cycle');
    await this.rollbackKey(LAST_CYCLE_KEY, 'the last cycle record', 'retired a cycle');
  }

  /** The cycle proper: everything syncNow reports on, with none of the bookkeeping it does after. */
  private async runCycle(epoch: number): Promise<SyncNowResult> {
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
      // syncNow's epoch gate only drops the bookkeeping, and by the time it runs every pulled
      // record has already been written locally — this is what stops those writes mid-page.
      isCancelled: () => this.accountEpoch !== epoch,
    };
    let pull: PullResult;
    try {
      pull = await pullOnce(cycleDeps);
    } catch (err) {
      return this.cycleFailure(err);
    }
    if (pull.kind === 'cancelled') {
      return { kind: 'cancelled' };
    }

    // Push still runs after a stalled pull — outbound changes must not be held hostage by an
    // inbound wedge — but the stall outranks a push error when reporting, because only the stall
    // describes what is actually wrong with this device. A 401 outranks both: it needs cleanup.
    // Boxed, not bare: a thrown `undefined` is still a push failure worth reporting.
    let outrankedPush: { error: unknown } | undefined;
    try {
      if ((await pushOnce(cycleDeps)).kind === 'cancelled') {
        return { kind: 'cancelled' };
      }
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
  // Void-returning by signature, not by convention: a step that reports failure by RESOLVING would
  // have that answer swallowed here, so the compiler refuses it and the caller must check instead.
  private async bestEffort(step: () => Promise<void> | void, what: string): Promise<void> {
    try {
      await step();
    } catch (err) {
      // Cause in the message text, like the cycle log above: `message` and `cause` are both
      // non-enumerable, so an object payload renders as `{}` on JSON surfaces.
      logger.error(
        `Cloud sync ${what} failed; what it belongs to still stands: ${describeThrown(err)}`,
        err
      );
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

  /** The last recorded answer, without asking the server; null until something has checked. */
  getRecoveryEnvelopePresent(): boolean | null {
    return this.recoveryEnvelope;
  }

  /**
   * Asks the server whether this account still has a recovery envelope and records the answer.
   * Hosts call it from their details lookup, so the settings banner that reads it is what pays for
   * it (ENG-98). Never throws, storage included — an unreachable server leaves the last answer
   * standing, and null means nobody has answered, which hosts must not paint as "missing".
   */
  async refreshRecoveryEnvelope(): Promise<boolean | null> {
    const epoch = this.accountEpoch;
    try {
      return await this.queueEnvelope(async () => {
        // Like getAccount: a signed-out device would only earn a 401 and a warning for asking.
        if ((await this.deps.sessionManager.getToken()) === null) {
          return this.recoveryEnvelope;
        }
        const present = (await this.deps.apiClient.getRecoveryEnvelope()) !== null;
        const news = await this.recordRecoveryEnvelope(present, epoch);
        if (this.accountEpoch !== epoch) {
          return null;
        }
        if (news && !present) {
          // Regenerate recovery code is the one repair, and it lives in the panel that just asked.
          logger.error(
            'Cloud sync has no recovery envelope on the server; regenerate your recovery code to restore it'
          );
        }
        return present;
      });
    } catch (err) {
      logger.warn(`Could not check the cloud sync recovery envelope: ${describeThrown(err)}`, {
        error: err,
      });
      // disableSync clears the session before it nulls the field, so a disable landing mid-fetch
      // arrives here as a 401 with the removed account's answer still readable.
      return this.accountEpoch === epoch ? this.recoveryEnvelope : null;
    }
  }

  /**
   * Serialises every envelope read and write: unqueued, a refresh's GET and the record it drives
   * straddle a Regenerate and persist the "absent" that PUT just fixed. Not reentrant — enforced by
   * `.biome/no-reentrant-envelope-queue.grit`, which only sees direct calls.
   */
  private queueEnvelope<T>(op: () => Promise<T>): Promise<T> {
    const run = this.envelopeQueue.then(op, op);
    this.envelopeQueue = run.then(
      () => {},
      () => {}
    );
    return run;
  }

  /**
   * Records what a check found and answers whether it is news. Compared against the PERSISTED
   * value, not the field: a respawned worker starts blank, so an in-memory check would call the
   * steady state news every time the panel asked — which is the log repeat this exists to stop.
   */
  private async recordRecoveryEnvelope(present: boolean, epoch: number): Promise<boolean> {
    const stored = await this.deps.keyStore.get<boolean>(RECOVERY_ENVELOPE_KEY, 'local');
    if (this.accountEpoch !== epoch) {
      // A disable landed across the read. Re-creating the key it removed, or the field it nulled,
      // leaves the previous account's badge waiting for whichever one connects next.
      return false;
    }
    this.recoveryEnvelope = present;
    if (stored === present) {
      return false;
    }
    const result = await this.deps.keyStore.set(RECOVERY_ENVELOPE_KEY, present, 'local');
    if (!result.success) {
      // Non-fatal: the badge is recomputed on the next check, and losing it costs a repeated log.
      logger.warn(`Failed to persist the recovery-envelope state: ${result.error.message}`, {
        error: result.error,
      });
    }
    return true;
  }

  /**
   * The in-session answer carries the failure's `error`; one hydrated after a restart does not.
   * Callers that can be answered before hydration (the extension's control path on a cold worker)
   * must await ensureHydrated() first, or a stored failure reads as "no cycle has run".
   */
  getLastCycle(): SyncCycleRead {
    if (!this.lastCycleKnown) {
      return { known: false };
    }
    return { known: true, cycle: this.lastCycle };
  }

  /**
   * Reads the persisted stamp and cycle record, once per process. Public and memoised because the
   * extension answers a control message from a cold worker BEFORE start() runs — the listeners are
   * registered synchronously while start() waits on the settings migration.
   */
  async ensureHydrated(): Promise<void> {
    this.hydration ??= this.hydrate();
    await this.hydration;
  }

  /**
   * Never rejects, and keeps the memo unless the read is worth retrying. start() awaits this
   * before the key check, so a rejection would leave the engine keyless behind a pill the extension
   * still persists as 'active', and skip the branches that stop it answering "no cycle has run".
   */
  private async hydrate(): Promise<void> {
    const epoch = this.accountEpoch;
    let result: HydrationResult = 'final';
    try {
      result = await this.readPersistedSyncState(epoch);
    } catch (err) {
      // Logged unconditionally: a throw is device-level evidence — a broken adapter, or a defect in
      // our own parse path — and it is not the disabled account's fault that it surfaced now. Only
      // the state writes are epoch-gated, since those do speak for an account.
      logger.error(`Could not read the persisted sync state: ${describeThrown(err)}`, err);
      if (this.accountEpoch === epoch) {
        this.markLastCycleUnknown();
        result = 'retry';
      }
    }
    // Only while this call still owns the memo — a disable or a newer read may have replaced it,
    // and clearing that would run two reads concurrently over the same fields.
    if (result === 'retry' && this.accountEpoch === epoch) {
      this.hydration = null;
    }
  }

  /** `retry` only for a read that failed outright and may succeed later; see HydrationResult. */
  private async readPersistedSyncState(epoch: number): Promise<HydrationResult> {
    // One batch read, because `get` collapses "absent" into "read failed" and this is the one
    // place that distinction decides whether a wedged device shows a badge.
    const stored = await this.deps.keyStore.getMany(
      [LAST_SYNCED_AT_KEY, LAST_CYCLE_KEY, RECOVERY_ENVELOPE_KEY],
      'local'
    );
    if (this.accountEpoch !== epoch) {
      // Installed nothing, but disableSync already cleared the memo; clearing again could drop
      // a newer read's.
      logger.debug('Dropped a hydration snapshot: the account was disabled while it was read');
      return 'final';
    }
    if (stored === null) {
      logger.error('Could not read the persisted sync state; the next read will retry');
      this.markLastCycleUnknown();
      return 'retry';
    }

    const stamp = stored[LAST_SYNCED_AT_KEY];
    if (stamp !== undefined) {
      this.hydrateStamp(stamp);
    }

    // Only a positively-read boolean; anything else stays null, which the panel paints as nothing
    // rather than as an account with no recovery path.
    const envelope = stored[RECOVERY_ENVELOPE_KEY];
    if (envelope?.readable === true && typeof envelope.value === 'boolean') {
      this.recoveryEnvelope = envelope.value;
    }

    const record = stored[LAST_CYCLE_KEY];
    if (record === undefined) {
      // A conclusive read clears any earlier unknown: this retry is the whole point of not
      // memoising a failed one.
      this.lastCycleKnown = true;
      return 'final';
    }
    if (!record.readable) {
      logger.error('The stored last sync cycle is unreadable; reporting it as unknown', {
        key: LAST_CYCLE_KEY,
      });
      this.markLastCycleUnknown();
      // Final: a value that will not read is deterministic, so retrying only repeats the log.
      return 'final';
    }
    const hydrated = parsePersistedSyncCycle(record.value);
    if (hydrated === null) {
      // A record that will not parse is not "no cycle" either — say unknown rather than paint health.
      logger.error('The stored last sync cycle is not a cycle record; reporting it as unknown', {
        key: LAST_CYCLE_KEY,
        shape: describeShape(record.value),
      });
      this.markLastCycleUnknown();
      return 'final';
    }
    this.lastCycleKnown = true;
    if (this.lastCycle === null) {
      this.lastCycle = hydrated;
    }
    return 'final';
  }

  /**
   * Installs the persisted stamp, or names why it could not be. Both rejections log at error: only
   * localStorage can report an unreadable value, and the app embedding it ships logLevel 'error',
   * so a warn would be unreachable by anyone able to act on it.
   */
  private hydrateStamp(stamp: StoredValue): void {
    if (!stamp.readable) {
      logger.error('The stored last-synced stamp is unreadable', { key: LAST_SYNCED_AT_KEY });
      return;
    }
    if (typeof stamp.value !== 'number') {
      logger.error('The stored last-synced stamp is not a number', {
        key: LAST_SYNCED_AT_KEY,
        shape: describeShape(stamp.value),
      });
      return;
    }
    // A cycle this process already ran outranks the stored one.
    if (this.lastSyncedAt === null) {
      this.lastSyncedAt = stamp.value;
    }
  }

  /**
   * Storage could not answer. Only downgrades while this process has run no cycle of its own: the
   * pull wake syncs without awaiting hydration, so a later failed read would otherwise mask the
   * failure that cycle already recorded — the badge this whole path exists to show.
   */
  private markLastCycleUnknown(): void {
    if (this.lastCycle === null) {
      this.lastCycleKnown = false;
    }
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

  /** Check the DK, then hold it and arm the pull loop. No-op if sync was never enabled here. */
  async start(): Promise<void> {
    // Snapshotted BEFORE the flag read, not after: a disable completing while that read is in
    // flight returns a stale `true`, and an epoch taken afterwards already matches the bump, so
    // every check below would compare equal and none of them would fire.
    const epoch = this.accountEpoch;

    const enabled = await this.deps.keyStore.get<boolean>(CLOUD_SYNC_ENABLED_KEY, 'local');
    if (enabled !== true) {
      return;
    }

    // The details-UI stamp and the cycle record beside it, before this process runs one of its own.
    // Idempotent: a control message answered on a cold worker already triggered this.
    await this.ensureHydrated();

    try {
      await checkForLostDataKey(this.keyDeps());
    } catch (err) {
      // Before the type test, not inside it: disableSync clears the session first, so the envelope
      // fetch usually 401s rather than raising SelfHealNeedsEnrollError — and the rethrow makes
      // the host log "Sync engine failed to start" for what the user deliberately did.
      if (this.startSuperseded(epoch)) {
        return;
      }
      if (err instanceof SelfHealNeedsEnrollError) {
        // The ordinary lost-key case, not a rare one: every account that enabled sync has an
        // envelope, so a device that loses its key throws here rather than falling through.
        logger.error(
          "Cloud sync needs the recovery code: this device's data key could not be read"
        );
        this.setStatus('needs_enroll');
        return;
      }
      if (err instanceof ApiError && err.status === 401) {
        await this.handleAuthLoss();
        return;
      }
      // Falls through to the key load: an unreachable server says nothing about the key on disk,
      // and abandoning here left an enrolled device reading "off" on macOS after one offline launch.
      logger.error(`Cloud sync could not check its data key: ${describeThrown(err)}`, err);
    }

    const persisted = await loadPersistedDataKey(this.deps.keyStore);
    if (this.startSuperseded(epoch)) {
      return;
    }
    if (persisted === null) {
      // The enabled flag outlived the key, so nothing syncs and every later wake is a no-op that
      // re-arms itself. "could not be read" rather than "is gone": a transient read failure lands
      // here too, and the adapter reports both as null.
      logger.error(
        "Cloud sync is enabled but this device's data key could not be read; it will not sync until it reconnects"
      );
      // Not signed_out: the session may be fine, so the UI must ask for the recovery code.
      this.setStatus('needs_enroll');
      return;
    }

    this.dk = persisted.dk;
    this.keyId = persisted.keyId;
    this.setStatus('active');
    await this.syncNowLoopSafe();
    await this.armPullLoopUnlessOff();
  }

  private enrollSuperseded(epoch: number): boolean {
    if (this.accountEpoch === epoch) {
      return false;
    }
    logger.debug('Sync enable abandoned: the account was disabled while it was enrolling');
    // Written here rather than left to the disable: disableSync sets it LAST, after several
    // awaited storage hops, so the abandoned enable's own unwind would otherwise hand the host a
    // mid-enable status and be reported as a connect that worked.
    this.setStatus('disabled');
    return true;
  }

  /**
   * Whether a disable landed while start() was running. Every exit past the enabled-flag read must
   * check it: otherwise start() reports the user's own action as a defect, or re-activates the pill
   * and the pull wake for an account they just removed.
   */
  private startSuperseded(epoch: number): boolean {
    if (this.accountEpoch === epoch) {
      return false;
    }
    logger.debug('Sync start abandoned: the account was disabled while it was starting');
    return true;
  }

  /** Cancels the armed pull wake. Does not touch session/keys — call disableSync() for that. */
  async stop(): Promise<void> {
    await this.deps.scheduler.cancel(SYNC_PULL_WAKE_ID);
    if (this.pushTimer !== null) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
      this.pushDeadline = null;
    }
  }

  /**
   * Host wiring: `armSyncPull` only schedules a single shot, so the host's
   * `SchedulerHost.onFire(id => { if (id === SYNC_PULL_WAKE_ID) engine.handlePullWake(); })`
   * must call this to run the cycle and re-arm the next wake. See package CLAUDE.md.
   */
  async handlePullWake(): Promise<void> {
    await this.syncNowLoopSafe();
    await this.armPullLoopUnlessOff();
  }

  async markMutated(collection: string, entityId: string): Promise<void> {
    await this.tracker.markMutated(collection, entityId);
    this.schedulePush();
  }

  /** Bulk form of markMutated: one meta load/save for the whole id list, not one per id. */
  async markMutatedBulk(collection: string, entityIds: string[]): Promise<void> {
    await this.tracker.markMutatedBulk(collection, entityIds);
    this.schedulePush();
  }

  async markDeleted(collection: string, entityId: string): Promise<void> {
    await this.tracker.markDeleted(collection, entityId);
    this.schedulePush();
  }

  private schedulePush(): void {
    // Statuses whose wake is cancelled or whose cycles cannot complete; enableSync re-arms.
    if (
      this.status === 'disabled' ||
      this.status === 'signed_out' ||
      this.status === 'needs_enroll'
    ) {
      return;
    }
    const now = this.now();
    if (this.pushDeadline === null) {
      this.pushDeadline = now + PUSH_MAX_WAIT_MS;
    }
    const delay = Math.min(PUSH_DEBOUNCE_MS, Math.max(0, this.pushDeadline - now));
    if (this.pushTimer !== null) {
      clearTimeout(this.pushTimer);
    }
    this.pushTimer = setTimeout(() => {
      void this.firePush();
    }, delay);
  }

  private async firePush(): Promise<void> {
    this.pushTimer = null;
    if (this.cyclesInFlight > 0) {
      // Clear the deadline before re-arming: otherwise, once the in-flight cycle outlives
      // PUSH_MAX_WAIT_MS, the stale deadline computes delay 0 forever and this spins instead
      // of polling. Re-arm rather than run a second cycle over the top of the one already going.
      this.pushDeadline = null;
      this.schedulePush();
      return;
    }
    this.pushDeadline = null;
    await this.syncNowLoopSafe();
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
  private async armPullLoopUnlessOff(): Promise<void> {
    // All three had their wake cancelled, or can never complete a cycle; re-arming undoes that.
    // enableSync arms it again once the device recovers.
    if (
      this.status === 'signed_out' ||
      this.status === 'disabled' ||
      this.status === 'needs_enroll'
    ) {
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

  // Only the cursor: widening this would drop the quarantine list too, and the device would
  // re-quarantine the same records on its next pull, re-toasting the user every time.
  private async resetPullCursor(): Promise<void> {
    await this.meta.update((meta) => {
      meta.cursor = 0;
    });
  }

  private async resetMeta(): Promise<void> {
    await this.meta.update((meta) => {
      meta.cursor = 0;
      meta.dirty = {};
      meta.hlcs = {};
      meta.tombstones = [];
      meta.quarantine = [];
    });
  }

  // Auth 401 (spec §5): drop the session, stop the loop, keep local data + DK. User re-enables.
  private async handleAuthLoss(): Promise<void> {
    // Status first, steps independent: a partial cleanup failure must never leave the engine
    // reporting health — armPullLoopUnlessOff reads that status to decide whether to poll on.
    await this.bestEffort(() => this.setStatus('signed_out'), 'signed-out status notification');
    // Not through bestEffort: clear() reports a surviving token by resolving false, and that token
    // is a live credential — it keeps isSignedIn() true for an account this device just lost.
    if (!(await this.clearSessionSafely())) {
      logger.error(
        `Cloud sync lost its authorisation but could not clear the session: ${SYNC_SESSION_KEY}`
      );
    }
    await this.bestEffort(() => this.stop(), 'pull-wake cancel');
  }
}
