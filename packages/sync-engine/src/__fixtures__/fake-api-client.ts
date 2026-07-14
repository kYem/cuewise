import type {
  ExchangeTokenRequest,
  KeyEnvelopeRecord,
  PushRecord,
  SyncRecord,
} from '@cuewise/shared';
import { ApiError } from '@cuewise/sync-client';
import { PULL_PAGE } from '../cycle';
import type { EngineApiClient } from '../engine';

/**
 * Shared in-memory backend behind one or more FakeApiClient "devices" — mirrors the real
 * server closely enough to exercise enable/enroll/migration/union without a live worker.
 */
export class FakeSyncServer {
  private nextSeq = 0;
  private recoveryEnvelope: string | null = null;
  private readonly records: SyncRecord[] = [];

  getRecoveryEnvelope(): KeyEnvelopeRecord | null {
    if (this.recoveryEnvelope === null) {
      return null;
    }
    return { envelope: this.recoveryEnvelope, updatedAt: 0 };
  }

  putRecoveryEnvelope(envelope: string, ifAbsent: boolean): void {
    if (ifAbsent && this.recoveryEnvelope !== null) {
      throw new ApiError('key_envelope_exists', 409);
    }
    this.recoveryEnvelope = envelope;
  }

  // Upsert-by-id, like the real store's push handler — a retried push is a no-op on content.
  pushChanges(records: PushRecord[]): { cursor: number } {
    for (const rec of records) {
      const idx = this.records.findIndex(
        (r) => r.collection === rec.collection && r.entityId === rec.entityId
      );
      this.nextSeq += 1;
      const stored: SyncRecord = { ...rec, seq: this.nextSeq };
      if (idx === -1) {
        this.records.push(stored);
      } else {
        this.records[idx] = stored;
      }
    }
    return { cursor: this.nextSeq };
  }

  getChanges(since: number): { records: SyncRecord[]; cursor: number } {
    // Real D1 always does `ORDER BY seq ASC` (records is upsert-per-entity, so array insertion
    // order drifts from seq order once an entity is pushed a second time) — sort to match.
    const page = this.records
      .filter((r) => r.seq > since)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, PULL_PAGE);
    const cursor = page.length > 0 ? page[page.length - 1].seq : since;
    return { records: page, cursor };
  }

  /** Test-only inspection of everything the server currently holds. */
  allRecords(): readonly SyncRecord[] {
    return this.records;
  }
}

/**
 * In-memory ApiClient fake for engine tests. exchangeToken mints a throwaway token; every
 * other call proxies to a FakeSyncServer shared across "devices". Toggle the reject* flags
 * to simulate a 401 at a specific point in a flow.
 */
export class FakeApiClient implements EngineApiClient {
  rejectExchangeWith401 = false;
  rejectAllWith401 = false;
  /** One-shot: throws a retryable network_error on the next getChanges call, then clears itself. */
  rejectNextGetChangesWithNetworkError = false;
  /** One-shot: throws a 401 on the next getChanges (pull) call only, then clears itself. */
  rejectNextGetChangesWith401 = false;
  readonly callOrder: string[] = [];
  private tokenCounter = 0;

  constructor(private readonly server: FakeSyncServer) {}

  async exchangeToken(_req: ExchangeTokenRequest): Promise<{ token: string }> {
    if (this.rejectExchangeWith401) {
      throw new ApiError('invalid_credential', 401);
    }
    this.tokenCounter += 1;
    return { token: `fake-token-${this.tokenCounter}` };
  }

  async getRecoveryEnvelope(): Promise<KeyEnvelopeRecord | null> {
    this.assertAuthorized();
    return this.server.getRecoveryEnvelope();
  }

  async putRecoveryEnvelope(envelope: string, opts?: { ifAbsent?: boolean }): Promise<void> {
    this.assertAuthorized();
    this.server.putRecoveryEnvelope(envelope, opts?.ifAbsent === true);
  }

  async getChanges(since: number): Promise<{ records: SyncRecord[]; cursor: number }> {
    this.assertAuthorized();
    if (this.rejectNextGetChangesWithNetworkError) {
      this.rejectNextGetChangesWithNetworkError = false;
      throw new ApiError('network_error', 0);
    }
    if (this.rejectNextGetChangesWith401) {
      this.rejectNextGetChangesWith401 = false;
      throw new ApiError('invalid_token', 401);
    }
    this.callOrder.push('getChanges');
    return this.server.getChanges(since);
  }

  async pushChanges(records: PushRecord[]): Promise<{ cursor: number }> {
    this.assertAuthorized();
    this.callOrder.push('pushChanges');
    return this.server.pushChanges(records);
  }

  private assertAuthorized(): void {
    if (this.rejectAllWith401) {
      throw new ApiError('invalid_token', 401);
    }
  }
}
