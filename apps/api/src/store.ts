import type {
  PairingCommitment,
  PairingNonceB64,
  PairingPublicKeyB64,
  PeerWrappedEnvelope,
} from '@cuewise/crypto';
import type {
  KeyEnvelopeExport,
  KeyEnvelopeRecord,
  PushRecord,
  SyncRecord,
  SyncSession,
} from '@cuewise/shared';
import type { RawSessionToken, SessionId, SessionTokenHash } from './crypto-utils';

export type { KeyEnvelopeExport, KeyEnvelopeRecord, PushRecord, SyncRecord, SyncSession };

export interface Identity {
  provider: 'google' | 'apple' | 'dev';
  providerSub: string;
  email?: string;
}

export interface Session {
  userId: string;
  tokenHash: SessionTokenHash;
}

export interface SignInCodePayload {
  provider: 'apple' | 'google';
  providerSub: string;
  email?: string;
}

/**
 * A third-party grant parked between the provider's redirect and the app claiming it. The
 * callback runs in a browser with no session, so it cannot know whose account this is; the
 * device that fires the deep link redeems the code with its own session, which is what binds
 * the grant to whoever actually authorised — not to whoever minted the link.
 */
export interface ProviderCodePayload {
  provider: 'notion';
  grant: SealedGrant;
}

export type AuthCodePayload = SignInCodePayload | ProviderCodePayload;

/** Access and refresh tokens as stored: AES-GCM under PROVIDER_TOKEN_KEY. */
export interface SealedGrant {
  ciphertext: string;
  iv: string;
  refreshCiphertext: string | null;
  refreshIv: string | null;
  workspace: string | null;
}

// Device-to-device pairing (ENG-50): a short-lived relay row so a new device can join an
// account by approving from one already signed in, without typing a code by hand.
export const PAIRING_TTL_MS = 10 * 60 * 1000;

export interface PendingPairing {
  id: string;
  deviceName: string;
  requesterCommitment: PairingCommitment;
  // Null until the requester reveals, which the server refuses before the approver has committed.
  requesterPublicKey: PairingPublicKeyB64 | null;
  requesterNonce: PairingNonceB64 | null;
  createdAt: number;
}

export interface PairingForRequester {
  id: string;
  approverPublicKey: PairingPublicKeyB64 | null;
  envelope: PeerWrappedEnvelope | null;
  expiresAt: number;
}

/** Thrown by `applyChanges` when a push would take the user past their per-user record cap. */
export class StorageQuotaExceededError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'StorageQuotaExceededError';
  }
}

// dataSourceId is the table queried — Notion's schema lives on the data source, not the database.
export interface ProviderConnection extends SealedGrant {
  provider: string;
  dataSourceId: string | null;
}

export interface SyncStore {
  findOrCreateUser(identity: Identity): Promise<string>;
  // The provider-verified email for the account-details UI; null when none was ever verified
  // (or the user row no longer exists — a deleted account racing a live session).
  getUserEmail(userId: string): Promise<string | null>;
  createSession(userId: string, deviceName: string): Promise<RawSessionToken>;
  lookupSession(rawToken: RawSessionToken): Promise<Session | null>;
  revokeSession(rawToken: RawSessionToken): Promise<void>;
  // Per-device management (ENG-95). Every one is scoped to userId, so a session belonging to
  // another account is indistinguishable from one that does not exist.
  listSessions(userId: string, currentTokenHash: SessionTokenHash): Promise<SyncSession[]>;
  // false when no row with that id belongs to this user; expiry is not checked, since listSessions
  // never hands out an expired id. Branded id, so a SessionTokenHash can't land in this slot.
  revokeSessionById(userId: string, id: SessionId): Promise<boolean>;
  renameSession(userId: string, id: SessionId, deviceName: string): Promise<boolean>;
  revokeOtherSessions(userId: string, currentTokenHash: SessionTokenHash): Promise<number>;
  mintAuthCode(payload: AuthCodePayload, codeChallenge: string): Promise<string>;
  consumeAuthCode(
    rawCode: string
  ): Promise<{ payload: AuthCodePayload; codeChallenge: string } | null>;
  // Throws StorageQuotaExceededError when the push would exceed the per-user record cap.
  applyChanges(userId: string, changes: PushRecord[]): Promise<number>;
  // Returns at most MAX_CHANGES_PAGE_SIZE records; a full page means the caller should pull
  // again from the returned cursor. `cursor` is the last returned seq (or `since` when empty).
  listChanges(userId: string, since: number): Promise<{ records: SyncRecord[]; cursor: number }>;
  // Without the envelopes an export is undecryptable even by a user holding their recovery code.
  exportUser(userId: string): Promise<{ records: SyncRecord[]; keyEnvelopes: KeyEnvelopeExport[] }>;
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
  // The only credential the server decrypts itself: a provider token is useless to us wrapped
  // in a client-only key. One row per (user, provider), and no whole-row writer: every write
  // below touches only its own columns, so a renewal and a selection in flight together cannot
  // clobber each other.
  getProviderConnection(userId: string, provider: string): Promise<ProviderConnection | null>;
  deleteProviderConnection(userId: string, provider: string): Promise<void>;
  // A (re)connect: replaces the grant but keeps an already-chosen table, in SQL, so no
  // read-then-write window can revert a selection that lands in between.
  putProviderGrant(userId: string, provider: string, grant: SealedGrant): Promise<void>;
  // `null` refresh means "keep the stored one" — a renewal that does not rotate the refresh
  // token must not erase it. Both answer false when no row exists.
  updateProviderTokens(
    userId: string,
    provider: string,
    tokens: Pick<SealedGrant, 'ciphertext' | 'iv' | 'refreshCiphertext' | 'refreshIv'>
  ): Promise<boolean>;
  setProviderDataSource(userId: string, provider: string, dataSourceId: string): Promise<boolean>;
  // Returns null only when the token row was physically deleted mid-request (concurrent account
  // deletion); revocation leaves the row and is already caught upstream by lookupSession.
  bumpRateWindow(
    tokenHash: SessionTokenHash,
    windowMs: number
  ): Promise<{ count: number; resetInMs: number } | null>;
  // Session identity rides the caller's tokenHash; the store resolves it to the tokens.id
  // handle internally, so a route never sees or stores a bare session id for pairing.
  createPairing(
    userId: string,
    requesterTokenHash: SessionTokenHash,
    commitment: PairingCommitment,
    now: number
  ): Promise<{ id: string; expiresAt: number }>;
  // null covers both an unknown id and an expired row — the caller can't distinguish, by design.
  getPairingForRequester(
    userId: string,
    id: string,
    now: number
  ): Promise<PairingForRequester | null>;
  listPendingPairings(
    userId: string,
    excludeTokenHash: SessionTokenHash,
    now: number
  ): Promise<PendingPairing[]>;
  commitPairing(
    userId: string,
    id: string,
    approverTokenHash: SessionTokenHash,
    publicKey: PairingPublicKeyB64,
    now: number
  ): Promise<'committed' | 'conflict' | 'not_found'>;
  // Only the requester session that created the row may reveal, refused until the approver has
  // committed. 'conflict' also covers a wrong-session caller (same ambiguity as commitPairing).
  revealPairing(
    userId: string,
    id: string,
    requesterTokenHash: SessionTokenHash,
    publicKey: PairingPublicKeyB64,
    nonce: PairingNonceB64,
    now: number
  ): Promise<'revealed' | 'conflict' | 'not_found'>;
  putPairingEnvelope(
    userId: string,
    id: string,
    approverTokenHash: SessionTokenHash,
    envelope: PeerWrappedEnvelope,
    now: number
  ): Promise<'stored' | 'conflict' | 'not_found'>;
  deletePairing(userId: string, id: string): Promise<boolean>;
  purgeExpiredPairings(now: number): Promise<number>;
}
