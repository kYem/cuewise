import type { EnableResult, SyncController, SyncDetails, SyncUiStatus } from '../sync-controller';

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
  | 'syncNow';

const DEFAULT_ENABLE_RESULT: EnableResult = { ok: true };
const DEFAULT_RECOVERY_CODE = 'FAKE-RECOVERY-CODE';

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
  private readonly failingMethods = new Set<FailableMethod>();
  private deferredDisable = false;
  private pendingDisable: (() => void) | null = null;
  private deferredGoogle = false;
  private pendingGoogle: ((result: EnableResult) => void) | null = null;

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

  async enable(
    accountId: string,
    deviceName: string,
    recoveryCode?: string
  ): Promise<EnableResult> {
    this.calls.push({ method: 'enable', args: [accountId, deviceName, recoveryCode] });
    this.maybeFail('enable');
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
    return DEFAULT_RECOVERY_CODE;
  }

  async syncNow(): Promise<void> {
    this.calls.push({ method: 'syncNow', args: [] });
    this.maybeFail('syncNow');
  }

  async getDetails(): Promise<SyncDetails | null> {
    this.calls.push({ method: 'getDetails', args: [] });
    const next = this.detailsResults.shift();
    if (next !== undefined) {
      return next;
    }
    return null;
  }

  /** Resolves a deferred enableWithGoogle as a quiet cancel, mirroring the macOS driver. */
  cancelEnableWithGoogle(): void {
    this.calls.push({ method: 'cancelEnableWithGoogle', args: [] });
    if (this.pendingGoogle !== null) {
      this.pendingGoogle({ ok: false, reason: 'auth', detail: 'cancelled' });
      this.pendingGoogle = null;
    }
  }

  async enrollWithCode(deviceName: string, recoveryCode: string): Promise<EnableResult> {
    this.calls.push({ method: 'enrollWithCode', args: [deviceName, recoveryCode] });
    this.maybeFail('enrollWithCode');
    const next = this.enrollWithCodeResults.shift();
    if (next !== undefined) {
      return next;
    }
    return DEFAULT_ENABLE_RESULT;
  }

  /** Queues the result the next `enrollWithCode()` call resolves to. */
  scriptEnrollWithCode(result: EnableResult): void {
    this.enrollWithCodeResults.push(result);
  }
}
