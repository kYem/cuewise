import type { SyncSession } from '@cuewise/shared';
import type { SyncNowResult, SyncOutcome } from '@cuewise/sync-engine';
import type {
  EnableResult,
  LastCycleRead,
  SyncController,
  SyncDetails,
  SyncUiStatus,
} from '../sync-controller';
import { LAST_CYCLE_UNAVAILABLE } from '../sync-controller';

interface RecordedCall {
  method: string;
  args: unknown[];
}

type FailableMethod =
  | 'enable'
  | 'enableWithGoogle'
  | 'enrollWithCode'
  | 'reconnect'
  | 'disable'
  | 'regenerateRecoveryCode'
  | 'syncNow'
  | 'getDetails'
  | 'getLastCycle'
  | 'listSessions'
  | 'revokeSession'
  | 'renameSession'
  | 'revokeOtherSessions';

const DEFAULT_ENABLE_RESULT: EnableResult = { ok: true };
const DEFAULT_RECOVERY_CODE = 'FAKE-RECOVERY-CODE';
const DEFAULT_SYNC_OUTCOME: SyncNowResult = { kind: 'synced' };

/** Scriptable SyncController fake for UI tests: settable status, queued enable/reconnect results, recorded calls. */
export class FakeSyncController implements SyncController {
  readonly calls: RecordedCall[] = [];
  /** Test-settable: whether canEnableWithGoogle() reports Google sign-in as available. */
  googleAvailable = true;

  private status: SyncUiStatus = 'off';
  private readonly subscribers = new Set<(status: SyncUiStatus) => void>();
  private readonly enableResults: EnableResult[] = [];
  private readonly enableWithGoogleResults: EnableResult[] = [];
  private readonly reconnectResults: EnableResult[] = [];
  private readonly enrollWithCodeResults: EnableResult[] = [];
  private readonly detailsResults: (SyncDetails | null)[] = [];
  private readonly syncNowResults: SyncNowResult[] = [];
  private lastCycleRead: LastCycleRead = { available: true, outcome: null };
  private readonly failingMethods = new Set<FailableMethod>();
  private deferredDisable = false;
  private pendingDisable: (() => void) | null = null;
  private deferredGoogle = false;
  private pendingGoogle: ((result: EnableResult) => void) | null = null;
  private deferredDetails = false;
  private pendingDetails: ((details: SyncDetails | null) => void) | null = null;
  private deferredLastCycle = false;
  private pendingLastCycle: ((read: LastCycleRead) => void) | null = null;
  private deferredRegenerate = false;
  private pendingRegenerate: ((code: string) => void) | null = null;
  private deferredSyncNow = false;
  private pendingSyncNow: {
    resolve: (outcome: SyncNowResult) => void;
    reject: (error: Error) => void;
  } | null = null;

  /** Makes the next call to `method` reject with an Error instead of resolving; clears after firing once. */
  failNext(method: FailableMethod): void {
    this.failingMethods.add(method);
  }

  /** Makes the next disable() call hang until resolveDisable() releases it — for asserting in-flight UI state (e.g. a loading spinner). */
  deferNextDisable(): void {
    this.deferredDisable = true;
  }

  /** Releases a disable() call armed via deferNextDisable(). */
  resolveDisable(): void {
    if (this.pendingDisable === null) {
      throw new Error('FakeSyncController: no pending disable() to resolve');
    }
    this.pendingDisable();
    this.pendingDisable = null;
  }

  /** Makes the next enableWithGoogle() hang until resolveEnableWithGoogle() — for asserting pending UI (spinner, unmount-mid-flow). */
  deferNextEnableWithGoogle(): void {
    this.deferredGoogle = true;
  }

  /** Releases an enableWithGoogle() call armed via deferNextEnableWithGoogle(). */
  resolveEnableWithGoogle(result: EnableResult): void {
    if (this.pendingGoogle === null) {
      throw new Error('FakeSyncController: no pending enableWithGoogle() to resolve');
    }
    this.pendingGoogle(result);
    this.pendingGoogle = null;
  }

  /** Makes the next getDetails() hang until resolveDetails() releases it — for asserting fetch races. */
  deferNextDetails(): void {
    this.deferredDetails = true;
  }

  /** Releases a getDetails() call armed via deferNextDetails(). */
  resolveDetails(details: SyncDetails | null): void {
    if (this.pendingDetails === null) {
      throw new Error('FakeSyncController: no pending getDetails() to resolve');
    }
    this.pendingDetails(details);
    this.pendingDetails = null;
  }

  /** Makes the next getLastCycle() hang until resolveLastCycle() releases it — for asserting read races. */
  deferNextLastCycle(): void {
    this.deferredLastCycle = true;
  }

  /** Releases a deferred getLastCycle() as an unreadable answer, as a dead worker gives. */
  resolveLastCycleUnavailable(): void {
    if (this.pendingLastCycle === null) {
      throw new Error('FakeSyncController: no pending getLastCycle() to resolve');
    }
    this.pendingLastCycle(LAST_CYCLE_UNAVAILABLE);
    this.pendingLastCycle = null;
  }

  /** Releases a getLastCycle() call armed via deferNextLastCycle(). */
  resolveLastCycle(outcome: SyncOutcome | null): void {
    if (this.pendingLastCycle === null) {
      throw new Error('FakeSyncController: no pending getLastCycle() to resolve');
    }
    this.pendingLastCycle({ available: true, outcome });
    this.pendingLastCycle = null;
  }

  /** Makes the next regenerateRecoveryCode() hang — the envelope is replaced before it resolves. */
  deferNextRegenerate(): void {
    this.deferredRegenerate = true;
  }

  /** Releases a regenerateRecoveryCode() armed via deferNextRegenerate(). */
  resolveRegenerate(code: string): void {
    if (this.pendingRegenerate === null) {
      throw new Error('FakeSyncController: no pending regenerateRecoveryCode() to resolve');
    }
    this.pendingRegenerate(code);
    this.pendingRegenerate = null;
  }

  /** Makes the next syncNow() hang until resolveSyncNow() releases it — for asserting stale resolutions. */
  deferNextSyncNow(): void {
    this.deferredSyncNow = true;
  }

  /** Releases a syncNow() call armed via deferNextSyncNow(). */
  resolveSyncNow(outcome: SyncNowResult): void {
    if (this.pendingSyncNow === null) {
      throw new Error('FakeSyncController: no pending syncNow() to resolve');
    }
    this.rememberCycle(outcome);
    this.pendingSyncNow.resolve(outcome);
    this.pendingSyncNow = null;
  }

  /**
   * Rejects a syncNow() armed via deferNextSyncNow() — the bridge's 30s timeout landing late.
   * failNext('syncNow') cannot model this: it throws before the defer arms.
   */
  rejectSyncNow(error: Error): void {
    if (this.pendingSyncNow === null) {
      throw new Error('FakeSyncController: no pending syncNow() to reject');
    }
    this.pendingSyncNow.reject(error);
    this.pendingSyncNow = null;
  }

  /** Records the call, then throws if `method` was armed via failNext (clearing the arm). */
  private maybeFail(method: FailableMethod): void {
    if (this.failingMethods.delete(method)) {
      throw new Error(`FakeSyncController: ${method} failed`);
    }
  }

  getStatus(): SyncUiStatus {
    return this.status;
  }

  subscribe(cb: (status: SyncUiStatus) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  /** Models the macOS adapter, which emits status from inside syncNow rather than around it. */
  emitsSyncingDuringSyncNow = false;

  /** Both hosts reach active before enable() resolves; the panel's ok-branch runs after that. */
  emitsActiveBeforeEnableResolves = false;

  /** Test helper: sets status and notifies subscribers (not part of SyncController). */
  setStatus(status: SyncUiStatus): void {
    this.status = status;
    for (const subscriber of this.subscribers) {
      subscriber(status);
    }
  }

  /** Queues the result the next `enable()` call resolves to. */
  scriptEnable(result: EnableResult): void {
    this.enableResults.push(result);
  }

  /** Queues the result the next `enableWithGoogle()` call resolves to. */
  scriptEnableWithGoogle(result: EnableResult): void {
    this.enableWithGoogleResults.push(result);
  }

  /** Queues the result the next `reconnect()` call resolves to. */
  scriptReconnect(result: EnableResult): void {
    this.reconnectResults.push(result);
  }

  /** Queues the result the next `getDetails()` call resolves to (unscripted calls resolve null). */
  scriptDetails(details: SyncDetails | null): void {
    this.detailsResults.push(details);
  }

  /** Queues the outcome the next `syncNow()` call resolves to; also becomes what `getLastCycle()` reports. */
  scriptSyncNow(outcome: SyncNowResult): void {
    this.syncNowResults.push(outcome);
  }

  /** Sets what `getLastCycle()` resolves to without a prior `syncNow()` call — exercises an on-mount read. */
  scriptLastCycle(outcome: SyncOutcome | null): void {
    this.lastCycleRead = { available: true, outcome };
  }

  /** Makes `getLastCycle()` report the cycle as unreadable, as a dead/skewed worker does. */
  scriptLastCycleUnavailable(): void {
    this.lastCycleRead = LAST_CYCLE_UNAVAILABLE;
  }

  async enable(
    accountId: string,
    deviceName: string,
    recoveryCode?: string
  ): Promise<EnableResult> {
    this.calls.push({ method: 'enable', args: [accountId, deviceName, recoveryCode] });
    this.maybeFail('enable');
    if (this.emitsActiveBeforeEnableResolves) {
      this.setStatus('active');
    }
    const next = this.enableResults.shift();
    if (next !== undefined) {
      return next;
    }
    return DEFAULT_ENABLE_RESULT;
  }

  async enableWithGoogle(deviceName: string, recoveryCode?: string): Promise<EnableResult> {
    this.calls.push({ method: 'enableWithGoogle', args: [deviceName, recoveryCode] });
    this.maybeFail('enableWithGoogle');
    if (this.deferredGoogle) {
      this.deferredGoogle = false;
      return new Promise((resolve) => {
        this.pendingGoogle = resolve;
      });
    }
    const next = this.enableWithGoogleResults.shift();
    if (next !== undefined) {
      return next;
    }
    return DEFAULT_ENABLE_RESULT;
  }

  canEnableWithGoogle(): boolean {
    return this.googleAvailable;
  }

  async reconnect(recoveryCode?: string): Promise<EnableResult> {
    this.calls.push({ method: 'reconnect', args: [recoveryCode] });
    this.maybeFail('reconnect');
    const next = this.reconnectResults.shift();
    if (next !== undefined) {
      return next;
    }
    return DEFAULT_ENABLE_RESULT;
  }

  async disable(): Promise<void> {
    this.calls.push({ method: 'disable', args: [] });
    this.maybeFail('disable');
    if (this.deferredDisable) {
      this.deferredDisable = false;
      return new Promise((resolve) => {
        this.pendingDisable = resolve;
      });
    }
  }

  async regenerateRecoveryCode(): Promise<string> {
    this.calls.push({ method: 'regenerateRecoveryCode', args: [] });
    this.maybeFail('regenerateRecoveryCode');
    if (this.deferredRegenerate) {
      this.deferredRegenerate = false;
      return new Promise((resolve) => {
        this.pendingRegenerate = resolve;
      });
    }
    return DEFAULT_RECOVERY_CODE;
  }

  async syncNow(): Promise<SyncNowResult> {
    this.calls.push({ method: 'syncNow', args: [] });
    // macOS emits 'syncing' synchronously here and reconciles in a finally; the extension bridge
    // never does. Off by default so existing tests keep modelling the bridge.
    if (this.emitsSyncingDuringSyncNow) {
      this.setStatus('syncing');
    }
    this.maybeFail('syncNow');
    if (this.deferredSyncNow) {
      this.deferredSyncNow = false;
      // The real adapter reconciles in a finally, so it emits on every path including this one.
      return new Promise<SyncNowResult>((resolve, reject) => {
        this.pendingSyncNow = { resolve, reject };
      }).finally(() => {
        if (this.emitsSyncingDuringSyncNow) {
          this.setStatus('active');
        }
      });
    }
    const next = this.syncNowResults.shift();
    const outcome = next !== undefined ? next : DEFAULT_SYNC_OUTCOME;
    this.rememberCycle(outcome);
    if (this.emitsSyncingDuringSyncNow) {
      this.setStatus('active');
    }
    return outcome;
  }

  /** Mirrors the engine: it records neither of these, so a later read must not report them. */
  private rememberCycle(outcome: SyncNowResult): void {
    if (outcome.kind === 'cancelled' || outcome.kind === 'no-key') {
      return;
    }
    this.lastCycleRead = { available: true, outcome };
  }

  async getLastCycle(): Promise<LastCycleRead> {
    this.calls.push({ method: 'getLastCycle', args: [] });
    this.maybeFail('getLastCycle');
    if (this.deferredLastCycle) {
      this.deferredLastCycle = false;
      return new Promise((resolve) => {
        this.pendingLastCycle = resolve;
      });
    }
    return this.lastCycleRead;
  }

  async getDetails(): Promise<SyncDetails | null> {
    this.calls.push({ method: 'getDetails', args: [] });
    this.maybeFail('getDetails');
    if (this.deferredDetails) {
      this.deferredDetails = false;
      return new Promise((resolve) => {
        this.pendingDetails = resolve;
      });
    }
    const next = this.detailsResults.shift();
    if (next !== undefined) {
      return next;
    }
    return null;
  }

  /** Scriptable session list; null models an unavailable read (offline, skewed worker). */
  sessionsResult: SyncSession[] | null = [];
  /** How many sessions revokeOtherSessions reports cutting. */
  revokedOthersCount = 0;

  async listSessions(): Promise<SyncSession[] | null> {
    this.calls.push({ method: 'listSessions', args: [] });
    // Failable despite the never-throws contract: the panel guards against a skewed host, and
    // that guard needs a way to be exercised.
    this.maybeFail('listSessions');
    return this.sessionsResult;
  }

  async revokeSession(id: string): Promise<void> {
    this.calls.push({ method: 'revokeSession', args: [id] });
    this.maybeFail('revokeSession');
  }

  async renameSession(id: string, deviceName: string): Promise<void> {
    this.calls.push({ method: 'renameSession', args: [id, deviceName] });
    this.maybeFail('renameSession');
  }

  async revokeOtherSessions(): Promise<number> {
    this.calls.push({ method: 'revokeOtherSessions', args: [] });
    this.maybeFail('revokeOtherSessions');
    return this.revokedOthersCount;
  }

  /** Resolves a deferred enableWithGoogle as a quiet cancel, mirroring the macOS driver. */
  cancelEnableWithGoogle?: () => void = () => {
    this.calls.push({ method: 'cancelEnableWithGoogle', args: [] });
    if (this.pendingGoogle !== null) {
      this.pendingGoogle({ ok: false, reason: 'auth', detail: 'cancelled' });
      this.pendingGoogle = null;
    }
  };

  /** Test helper: drop the optional cancelEnableWithGoogle capability to model a host without it (extension popup). */
  withoutHostCancel(): this {
    this.cancelEnableWithGoogle = undefined;
    return this;
  }

  enrollWithCode?: (deviceName: string, recoveryCode: string) => Promise<EnableResult> = async (
    deviceName,
    recoveryCode
  ) => {
    this.calls.push({ method: 'enrollWithCode', args: [deviceName, recoveryCode] });
    this.maybeFail('enrollWithCode');
    const next = this.enrollWithCodeResults.shift();
    if (next !== undefined) {
      return next;
    }
    return DEFAULT_ENABLE_RESULT;
  };

  /** Test helper: drop the optional enrollWithCode capability to model a host without it (extension). */
  withoutHostEnroll(): this {
    this.enrollWithCode = undefined;
    return this;
  }

  /** Queues the result the next `enrollWithCode()` call resolves to. */
  scriptEnrollWithCode(result: EnableResult): void {
    this.enrollWithCodeResults.push(result);
  }
}
