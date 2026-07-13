import type { EnableResult, SyncController, SyncUiStatus } from '../sync-controller';

interface RecordedCall {
  method: string;
  args: unknown[];
}

const DEFAULT_ENABLE_RESULT: EnableResult = { ok: true };
const DEFAULT_RECOVERY_CODE = 'FAKE-RECOVERY-CODE';

/** Scriptable SyncController fake for UI tests: settable status, queued enable/reconnect results, recorded calls. */
export class FakeSyncController implements SyncController {
  readonly calls: RecordedCall[] = [];

  private status: SyncUiStatus = 'off';
  private readonly subscribers = new Set<(status: SyncUiStatus) => void>();
  private readonly enableResults: EnableResult[] = [];
  private readonly reconnectResults: EnableResult[] = [];

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

  /** Queues the result the next `reconnect()` call resolves to. */
  scriptReconnect(result: EnableResult): void {
    this.reconnectResults.push(result);
  }

  async enable(
    accountId: string,
    deviceName: string,
    recoveryCode?: string
  ): Promise<EnableResult> {
    this.calls.push({ method: 'enable', args: [accountId, deviceName, recoveryCode] });
    const next = this.enableResults.shift();
    if (next !== undefined) {
      return next;
    }
    return DEFAULT_ENABLE_RESULT;
  }

  async reconnect(): Promise<EnableResult> {
    this.calls.push({ method: 'reconnect', args: [] });
    const next = this.reconnectResults.shift();
    if (next !== undefined) {
      return next;
    }
    return DEFAULT_ENABLE_RESULT;
  }

  async disable(): Promise<void> {
    this.calls.push({ method: 'disable', args: [] });
  }

  async regenerateRecoveryCode(): Promise<string> {
    this.calls.push({ method: 'regenerateRecoveryCode', args: [] });
    return DEFAULT_RECOVERY_CODE;
  }

  async syncNow(): Promise<void> {
    this.calls.push({ method: 'syncNow', args: [] });
  }
}
