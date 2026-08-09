import type {
  ExchangeTokenRequest,
  KeyEnvelopeRecord,
  PushRecord,
  SyncRecord,
  SyncSession,
} from '@cuewise/shared';
import {
  ApiError,
  type PairingCreated,
  type PairingForRequester,
  type PendingPairing,
} from '@cuewise/sync-client';
import { PULL_PAGE } from '../cycle';
import type { EngineApiClient } from '../engine';

/** The server's pairing TTL (apps/api's PAIRING_TTL_MS) — a row is unreachable after ten minutes. */
export const PAIRING_TTL_MS = 10 * 60 * 1000;

/** One relay row. `requesterSession`/`approverSession` stand in for the real tokens.id handles. */
interface FakePairing {
  id: string;
  requesterSession: string;
  requesterCommitment: string;
  // Both null until the reveal, which is refused before a commit and again once one is stored.
  requesterPublicKey: string | null;
  requesterNonce: string | null;
  deviceName: string;
  approverSession: string | null;
  approverPublicKey: string | null;
  envelope: string | null;
  createdAt: number;
  expiresAt: number;
}

/**
 * Shared in-memory backend behind one or more FakeApiClient "devices" — mirrors the real
 * server closely enough to exercise enable/enroll/migration/union without a live worker.
 */
export class FakeSyncServer {
  private nextSeq = 0;
  private nextSession = 0;
  private nextPairing = 0;
  private recoveryEnvelope: string | null = null;
  private readonly records: SyncRecord[] = [];
  // One server is one account, so every row here is already scoped the way the real store
  // scopes by userId; what still has to be told apart is which session made the call.
  private readonly pairings = new Map<string, FakePairing>();

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

  /** A fresh session handle for a "device"; a re-exchange mints a new one, as a new token does. */
  newSessionId(): string {
    this.nextSession += 1;
    return `fake-session-${this.nextSession}`;
  }

  // Device pairing (ENG-50), mirroring D1SyncStore: one live request per requester session,
  // commit only while no approver holds it, reveal only after that commit and only once, and the
  // envelope only from the session that committed, once the reveal is stored.
  createPairing(
    session: string,
    deviceName: string,
    commitment: string,
    now: number
  ): PairingCreated {
    for (const [id, row] of this.pairings) {
      if (row.requesterSession === session) {
        this.pairings.delete(id);
      }
    }
    this.nextPairing += 1;
    const id = `fake-pairing-${this.nextPairing}`;
    const expiresAt = now + PAIRING_TTL_MS;
    this.pairings.set(id, {
      id,
      requesterSession: session,
      requesterCommitment: commitment,
      requesterPublicKey: null,
      requesterNonce: null,
      deviceName,
      approverSession: null,
      approverPublicKey: null,
      envelope: null,
      createdAt: now,
      expiresAt,
    });
    return { id, expiresAt };
  }

  getPairingForRequester(id: string, now: number): PairingForRequester | null {
    const row = this.livePairing(id, now);
    if (row === undefined) {
      return null;
    }
    return {
      id: row.id,
      approverPublicKey: row.approverPublicKey,
      envelope: row.envelope,
      expiresAt: row.expiresAt,
    };
  }

  /** Excludes the caller's own request and anything already answered with an envelope. */
  listPendingPairings(excludeSession: string, now: number): PendingPairing[] {
    return [...this.pairings.values()]
      .filter(
        (row) =>
          row.expiresAt > now && row.envelope === null && row.requesterSession !== excludeSession
      )
      .map((row) => ({
        id: row.id,
        deviceName: row.deviceName,
        requesterCommitment: row.requesterCommitment,
        requesterPublicKey: row.requesterPublicKey,
        requesterNonce: row.requesterNonce,
        createdAt: row.createdAt,
      }));
  }

  commitPairing(
    id: string,
    session: string,
    publicKey: string,
    now: number
  ): 'committed' | 'conflict' | 'not_found' {
    const row = this.livePairing(id, now);
    if (row === undefined) {
      return 'not_found';
    }
    if (row.approverSession !== null) {
      return 'conflict';
    }
    row.approverSession = session;
    row.approverPublicKey = publicKey;
    return 'committed';
  }

  revealPairing(
    id: string,
    session: string,
    publicKey: string,
    nonce: string,
    now: number
  ): 'revealed' | 'conflict' | 'not_found' {
    const row = this.livePairing(id, now);
    if (row === undefined) {
      return 'not_found';
    }
    // Another session's reveal, one before any approver committed, and a second reveal all read
    // back as conflict, exactly as the real UPDATE's WHERE does.
    if (
      row.requesterSession !== session ||
      row.approverPublicKey === null ||
      row.requesterPublicKey !== null
    ) {
      return 'conflict';
    }
    row.requesterPublicKey = publicKey;
    row.requesterNonce = nonce;
    return 'revealed';
  }

  putPairingEnvelope(
    id: string,
    session: string,
    envelope: string,
    now: number
  ): 'stored' | 'conflict' | 'not_found' {
    const row = this.livePairing(id, now);
    if (row === undefined) {
      return 'not_found';
    }
    // An uncommitted or unrevealed row reads back as a conflict too, exactly as the real
    // UPDATE's WHERE does.
    if (row.approverSession !== session || row.requesterPublicKey === null) {
      return 'conflict';
    }
    row.envelope = envelope;
    return 'stored';
  }

  deletePairing(id: string): boolean {
    return this.pairings.delete(id);
  }

  private livePairing(id: string, now: number): FakePairing | undefined {
    const row = this.pairings.get(id);
    if (row === undefined || row.expiresAt <= now) {
      return undefined;
    }
    return row;
  }

  /**
   * Test-only: the malicious-relay case — swaps a stored reveal for a key the commitment the
   * approver captured does not cover. Nothing a real server may do, and everything it might try.
   */
  substituteRevealedPublicKey(id: string, publicKey: string): void {
    const row = this.pairings.get(id);
    if (row === undefined || row.requesterPublicKey === null) {
      throw new Error(`no revealed pairing to substitute a key on: ${id}`);
    }
    row.requesterPublicKey = publicKey;
  }

  /** Test-only inspection of everything the server currently holds. */
  allRecords(): readonly SyncRecord[] {
    return this.records;
  }

  /** Test-only: drops everything pushed so far, so a test can assert on what happens next. */
  reset(): void {
    this.records.length = 0;
  }
}

function pairingError(result: 'conflict' | 'not_found'): ApiError {
  if (result === 'conflict') {
    return new ApiError('pairing_conflict', 409);
  }
  return new ApiError('pairing_not_found', 404);
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
  /** The request from the most recent exchangeToken call, for asserting the sign-in provider. */
  lastExchangeRequest: ExchangeTokenRequest | null = null;
  /** Scriptable result for the account-details path (see SyncEngine.getAccount). */
  accountResult: { userId: string; email: string | null } = { userId: 'fake-user', email: null };
  /** One-shot: throws a 401 on the next getAccount call, then clears itself. */
  rejectNextGetAccountWith401 = false;
  /** Scriptable result for the session-list path (see SyncEngine.listSessions). */
  sessionsResult: SyncSession[] = [];
  /** One-shot: throws a 401 on the next listSessions call, then clears itself. */
  rejectNextListSessionsWith401 = false;
  /** One-shot: throws a 404 on the next revokeSession call, then clears itself. */
  rejectNextRevokeSessionWith404 = false;
  readonly revokedSessionIds: string[] = [];
  readonly renamedSessions: [string, string][] = [];
  revokeOtherSessionsResult = 0;
  /** Total successful token exchanges — proves resumeEnrollWithCode doesn't re-exchange. */
  exchangeCount = 0;
  /** This device's clock, which the server measures the pairing TTL against; move it to expire a row. */
  now: () => number = Date.now;
  private tokenCounter = 0;
  private nextGetChangesError: Error | null = null;
  private nextPushChangesError: Error | null = null;
  private sessionId: string;
  private deviceName = 'Fake Device';

  constructor(private readonly server: FakeSyncServer) {
    this.sessionId = server.newSessionId();
  }

  /** One-shot: fails the next getChanges as the server does on a discarded cursor. */
  rejectNextGetChangesWithResync(): void {
    this.nextGetChangesError = new ApiError('resync_required', 409);
  }

  /** One-shot: throws the given error on the next getChanges call, then clears itself. */
  rejectNextGetChanges(error: Error): void {
    this.nextGetChangesError = error;
  }

  /** One-shot: throws the given error on the next pushChanges call, then clears itself. */
  rejectNextPushChanges(error: Error): void {
    this.nextPushChangesError = error;
  }

  async exchangeToken(req: ExchangeTokenRequest): Promise<{ token: string }> {
    this.lastExchangeRequest = req;
    if (this.rejectExchangeWith401) {
      throw new ApiError('invalid_credential', 401);
    }
    this.tokenCounter += 1;
    this.exchangeCount += 1;
    // A new token is a new session row, and the device name a pairing is listed under is the
    // one that token was minted with.
    this.sessionId = this.server.newSessionId();
    this.deviceName = req.deviceName;
    return { token: `fake-token-${this.tokenCounter}` };
  }

  async getAccount(): Promise<{ userId: string; email: string | null }> {
    this.assertAuthorized();
    if (this.rejectNextGetAccountWith401) {
      this.rejectNextGetAccountWith401 = false;
      throw new ApiError('invalid_token', 401);
    }
    return this.accountResult;
  }

  async listSessions(): Promise<SyncSession[]> {
    this.assertAuthorized();
    if (this.rejectNextListSessionsWith401) {
      this.rejectNextListSessionsWith401 = false;
      throw new ApiError('invalid_token', 401);
    }
    return this.sessionsResult;
  }

  async revokeSession(id: string): Promise<void> {
    this.assertAuthorized();
    if (this.rejectNextRevokeSessionWith404) {
      this.rejectNextRevokeSessionWith404 = false;
      throw new ApiError('not_found', 404);
    }
    this.revokedSessionIds.push(id);
  }

  async renameSession(id: string, deviceName: string): Promise<void> {
    this.assertAuthorized();
    this.renamedSessions.push([id, deviceName]);
  }

  async revokeOtherSessions(): Promise<number> {
    this.assertAuthorized();
    return this.revokeOtherSessionsResult;
  }

  async getRecoveryEnvelope(): Promise<KeyEnvelopeRecord | null> {
    this.assertAuthorized();
    return this.server.getRecoveryEnvelope();
  }

  async putRecoveryEnvelope(envelope: string, opts?: { ifAbsent?: boolean }): Promise<void> {
    this.assertAuthorized();
    this.server.putRecoveryEnvelope(envelope, opts?.ifAbsent === true);
  }

  async createPairing(commitment: string): Promise<PairingCreated> {
    this.assertAuthorized();
    return this.server.createPairing(this.sessionId, this.deviceName, commitment, this.now());
  }

  async listPairings(): Promise<PendingPairing[]> {
    this.assertAuthorized();
    return this.server.listPendingPairings(this.sessionId, this.now());
  }

  // Null, not a throw: the real client maps the 404 an expired or denied row answers with, since
  // that is a poll state the requester loops on.
  async getPairing(id: string): Promise<PairingForRequester | null> {
    this.assertAuthorized();
    return this.server.getPairingForRequester(id, this.now());
  }

  async commitPairing(id: string, publicKey: string): Promise<void> {
    this.assertAuthorized();
    const result = this.server.commitPairing(id, this.sessionId, publicKey, this.now());
    if (result !== 'committed') {
      throw pairingError(result);
    }
  }

  async revealPairing(id: string, publicKey: string, nonce: string): Promise<void> {
    this.assertAuthorized();
    const result = this.server.revealPairing(id, this.sessionId, publicKey, nonce, this.now());
    if (result !== 'revealed') {
      throw pairingError(result);
    }
  }

  async putPairingEnvelope(id: string, envelope: string): Promise<void> {
    this.assertAuthorized();
    const result = this.server.putPairingEnvelope(id, this.sessionId, envelope, this.now());
    if (result !== 'stored') {
      throw pairingError(result);
    }
  }

  // 404-tolerant like the real client: denying a row that is already gone is done, not an error.
  async deletePairing(id: string): Promise<void> {
    this.assertAuthorized();
    this.server.deletePairing(id);
  }

  async getChanges(since: number): Promise<{ records: SyncRecord[]; cursor: number }> {
    // Recorded before every throw below: a call that HAPPENED must be visible to a test that
    // also scripts it to fail, or a call-order assertion silently reads it as never made.
    this.callOrder.push('getChanges');
    this.assertAuthorized();
    if (this.rejectNextGetChangesWithNetworkError) {
      this.rejectNextGetChangesWithNetworkError = false;
      throw new ApiError('network_error', 0);
    }
    if (this.rejectNextGetChangesWith401) {
      this.rejectNextGetChangesWith401 = false;
      throw new ApiError('invalid_token', 401);
    }
    if (this.nextGetChangesError !== null) {
      const err = this.nextGetChangesError;
      this.nextGetChangesError = null;
      throw err;
    }
    return this.server.getChanges(since);
  }

  async pushChanges(records: PushRecord[]): Promise<{ cursor: number }> {
    this.callOrder.push('pushChanges');
    this.assertAuthorized();
    if (this.nextPushChangesError !== null) {
      const err = this.nextPushChangesError;
      this.nextPushChangesError = null;
      throw err;
    }
    return this.server.pushChanges(records);
  }

  private assertAuthorized(): void {
    if (this.rejectAllWith401) {
      throw new ApiError('invalid_token', 401);
    }
  }
}
