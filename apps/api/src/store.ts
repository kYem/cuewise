import type { KeyEnvelopeRecord, PushRecord, SyncRecord } from '@cuewise/shared';
import type { RawSessionToken, SessionTokenHash } from './crypto-utils';

export type { KeyEnvelopeRecord, PushRecord, SyncRecord };

export interface Identity {
  provider: 'google' | 'apple' | 'dev';
  providerSub: string;
  email?: string;
}

export interface Session {
  userId: string;
  tokenHash: SessionTokenHash;
}

export interface AuthCodePayload {
  provider: 'apple';
  providerSub: string;
  email?: string;
}

/** Thrown by `applyChanges` when a push would take the user past their per-user record cap. */
export class StorageQuotaExceededError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'StorageQuotaExceededError';
  }
}

export interface SyncStore {
  findOrCreateUser(identity: Identity): Promise<string>;
  createSession(userId: string, deviceName: string): Promise<RawSessionToken>;
  lookupSession(rawToken: RawSessionToken): Promise<Session | null>;
  revokeSession(rawToken: RawSessionToken): Promise<void>;
  mintAuthCode(payload: AuthCodePayload, codeChallenge: string): Promise<string>;
  consumeAuthCode(
    rawCode: string
  ): Promise<{ payload: AuthCodePayload; codeChallenge: string } | null>;
  // Throws StorageQuotaExceededError when the push would exceed the per-user record cap.
  applyChanges(userId: string, changes: PushRecord[]): Promise<number>;
  // Returns at most MAX_CHANGES_PAGE_SIZE records; a full page means the caller should pull
  // again from the returned cursor. `cursor` is the last returned seq (or `since` when empty).
  listChanges(userId: string, since: number): Promise<{ records: SyncRecord[]; cursor: number }>;
  exportUser(userId: string): Promise<{ records: SyncRecord[] }>;
  deleteUser(userId: string): Promise<void>;
  // Deletes tombstones older than retentionMs (a maintenance sweep across all users); returns the count.
  purgeTombstones(retentionMs: number): Promise<number>;
  // Highest seq ever purged for this user (0 if never purged) — the resync-required boundary
  // for GET /changes: a since cursor below this may have missed a purged tombstone.
  getPurgedSeq(userId: string): Promise<number>;
  // E2E key envelopes: opaque client-wrapped blobs the server can never read.
  getKeyEnvelope(userId: string, kind: string): Promise<KeyEnvelopeRecord | null>;
  putKeyEnvelope(userId: string, kind: string, envelope: string): Promise<void>;
  // Create-only: inserts iff no (userId, kind) row exists yet. Returns false (no-op) when one
  // already does — the caller maps that to a 409, closing the "two devices both generate a key" race.
  putKeyEnvelopeIfAbsent(userId: string, kind: string, envelope: string): Promise<boolean>;
  // Returns null only when the token row was physically deleted mid-request (concurrent account
  // deletion); revocation leaves the row and is already caught upstream by lookupSession.
  bumpRateWindow(
    tokenHash: SessionTokenHash,
    windowMs: number
  ): Promise<{ count: number; resetInMs: number } | null>;
}
