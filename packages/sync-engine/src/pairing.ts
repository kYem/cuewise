import {
  type DataKey,
  decodePairingNonce,
  decodePairingPublicKey,
  derivePairingSas,
  encodePairingNonce,
  encodePairingPublicKey,
  generatePairingKeypair,
  makePairingCommitment,
  type PairingCommitment,
  type PairingKeyPair,
  type PairingNonce,
  type PairingPublicKey,
  type PeerWrappedEnvelope,
  unwrapDataKeyFromPeer,
  verifyPairingCommitment,
  wrapDataKeyToPeer,
} from '@cuewise/crypto';
import { describeThrown, type KeyValueStore, logger } from '@cuewise/shared';
import { ApiError, type PendingPairing, type SessionManager } from '@cuewise/sync-client';
import type { EngineApiClient, SyncStatus } from './engine';
import { persistDataKey, setAsideDataKey } from './key-lifecycle';

/**
 * What one poll of a pairing request found (ENG-50). `confirm` carries the digits both screens
 * show; only a matching pair may be approved. `error` is NON-terminal, like the approver's: the
 * request still stands and the next tick may answer it. Every `failed` IS terminal — the caller
 * stops polling and starts a new request. `tampered` mirrors the approver's: a caught substitution.
 */
export type PairingPollResult =
  | { kind: 'waiting' }
  | { kind: 'confirm'; sas: string }
  | { kind: 'complete' }
  | { kind: 'error' }
  | { kind: 'failed'; reason: 'expired_or_denied' | 'signed_out' | 'error' | 'tampered' };

/**
 * What one poll of a request this device COMMITTED to found. The digits cannot exist at commit
 * time — they cover a key the requester only reveals afterwards — so this is the wait that earns
 * them. `error` is NON-terminal: the request still stands and the next tick may answer it.
 * `tampered` is the one outcome a user must be told about — a caught key substitution.
 */
export type PairingApprovalResult =
  | { kind: 'waiting' }
  | { kind: 'confirm'; sas: string }
  | { kind: 'error' }
  | { kind: 'failed'; reason: 'tampered' | 'gone' };

/**
 * Statuses no pairing request may start from: `active` already has a key, and the four mid-enroll
 * ones are about to resolve one — a request from either races the key it would install.
 */
const PAIRING_BLOCKED_STATUSES: readonly SyncStatus[] = [
  'active',
  'signing_in',
  'key_init',
  'enrolling',
  'initial_sync',
];

/** The request this device is polling: its keypair, and what the approver has answered so far. */
interface PairingRequest {
  id: string;
  keypair: PairingKeyPair;
  /** Opens the commitment the create posted; useless to anyone but this device until revealed. */
  nonce: PairingNonce;
  revealed: boolean;
  sas: string | null;
  approverPub: PairingPublicKey | null;
  /** Captured at beginPairing, so the adopted key binds to the account that asked for it. */
  userId: string;
}

/**
 * The approver's half: what it committed to, and what the requester's reveal turned out to be.
 * `commitment` is captured from the row BEFORE the commit, so the key it covers is fixed before
 * this device's own key exists on the server for anyone to grind against.
 */
interface PairingApproval {
  id: string;
  keypair: PairingKeyPair;
  commitment: PairingCommitment;
  /** Null until a reveal verifies against `commitment` AND its digits derive; both land together,
   *  so a rejected derive can never leave a key to wrap with no digits ever shown. */
  verified: { requesterPub: PairingPublicKey; sas: string } | null;
}

/** Exactly the engine state and steps pairing reads or drives; every getter is read live. */
export interface PairingDeps {
  apiClient: Pick<
    EngineApiClient,
    | 'getAccount'
    | 'createPairing'
    | 'listPairings'
    | 'getPairing'
    | 'commitPairing'
    | 'revealPairing'
    | 'putPairingEnvelope'
    | 'deletePairing'
  >;
  sessionManager: Pick<SessionManager, 'isSignedIn'>;
  keyStore: KeyValueStore;
  status: () => SyncStatus;
  epoch: () => number;
  dk: () => DataKey | null;
  keyId: () => string | null;
  enrollSuperseded: (epoch: number) => boolean;
  handleEnableError: (err: unknown, before: SyncStatus, epoch: number) => Promise<void>;
  handleAuthLoss: () => Promise<void>;
  activateWithKey: (
    dk: DataKey,
    keyId: string,
    epoch: number,
    mintedCode: boolean,
    backfill: boolean
  ) => Promise<void>;
  bestEffort: (step: () => Promise<void> | void, what: string) => Promise<void>;
}

/** Both halves of the ENG-50 commit-then-reveal handshake; SyncEngine delegates to it. */
export class DevicePairing {
  // Held only between beginPairing and the poll that ends it; cleared by anything that ends the
  // session or the account it belongs to.
  private pairing: PairingRequest | null = null;
  // The approver's half of the same handshake: held between commitPairing and the
  // approvePairing/denyPairing that resolves it, cleared the same way as `pairing` above.
  private approving: PairingApproval | null = null;

  constructor(private readonly deps: PairingDeps) {}

  /** Drops both halves: the session or account they belonged to is gone. */
  forget(): void {
    this.pairing = null;
    this.approving = null;
  }

  /**
   * Starts a device-pairing request (ENG-50): this device publishes a COMMITMENT to a one-shot
   * public key — never the key itself, which only `pollPairing` reveals once an approver's own key
   * is fixed — for another signed-in device to wrap the account's data key to.
   * Null unless this device holds no key and is not mid-enroll — both surfaces that ask for a
   * recovery code qualify, a fresh device #2 (`disabled`) and one that lost its key
   * (`needs_enroll`) — or when the session that would carry the request is gone.
   */
  async beginPairing(): Promise<{ pairingId: string } | null> {
    if (this.deps.dk() !== null || PAIRING_BLOCKED_STATUSES.includes(this.deps.status())) {
      return null;
    }
    const epoch = this.deps.epoch();
    const before = this.deps.status();
    try {
      // Inside the try like resumeEnrollWithCode's: a storage fault reading the session belongs in
      // the shared mapping below, not out as a raw rejection.
      if (!(await this.deps.sessionManager.isSignedIn())) {
        // A disable is why the session is gone, and it has already cleared it; handleAuthLoss
        // would repaint the pill as "Sign-in expired" for a device the user disconnected.
        if (!this.deps.enrollSuperseded(epoch)) {
          await this.deps.handleAuthLoss();
        }
        return null;
      }
      const { userId } = await this.deps.apiClient.getAccount();
      const keypair = await generatePairingKeypair();
      const { commitment, nonce } = await makePairingCommitment(keypair.publicKey);
      const created = await this.deps.apiClient.createPairing(commitment);
      if (this.deps.enrollSuperseded(epoch)) {
        // Left standing, the row invites another device to wrap this account's key to one the
        // user has just disconnected from it.
        await this.deps.bestEffort(
          () => this.deps.apiClient.deletePairing(created.id),
          'abandoned pairing request cleanup'
        );
        return null;
      }
      this.pairing = {
        id: created.id,
        keypair,
        nonce,
        revealed: false,
        sas: null,
        approverPub: null,
        userId,
      };
      return { pairingId: created.id };
    } catch (err) {
      // Rethrows anything that is neither auth loss nor a disable, so the caller can show it.
      await this.deps.handleEnableError(err, before, epoch);
      return null;
    }
  }

  /**
   * One poll of the request `beginPairing` started (callers loop it while their screen is up).
   * Never throws: a transport fault is `error`, which leaves the request standing for the next
   * tick, and only `failed` is terminal — the request is then forgotten, so the caller must start
   * another rather than keep polling.
   */
  async pollPairing(): Promise<PairingPollResult> {
    const pairing = this.pairing;
    if (pairing === null) {
      return { kind: 'failed', reason: 'error' };
    }
    const epoch = this.deps.epoch();
    const before = this.deps.status();
    try {
      const found = await this.deps.apiClient.getPairing(pairing.id);
      // Two overlapping polls both read the same request before either finished; without this the
      // one that lost adopts the key a second time, re-running the whole activation over the top.
      if (this.pairing !== pairing) {
        return { kind: 'failed', reason: 'error' };
      }
      if (this.deps.dk() !== null) {
        // A typed recovery code won the race the enrol screen allows: this device is enrolled, and
        // adopting again would rewind its cursor and re-stamp every record it holds.
        this.pairing = null;
        return { kind: 'complete' };
      }
      if (found === null) {
        this.pairing = null;
        return { kind: 'failed', reason: 'expired_or_denied' };
      }
      if (found.approverPublicKey !== null && pairing.approverPub === null) {
        let approverPub: PairingPublicKey;
        try {
          // Decoded before the reveal: relay data that is not one usable key is a substitution, and
          // the one-shot reveal must not be spent on it.
          approverPub = decodePairingPublicKey(found.approverPublicKey);
        } catch (err) {
          return await this.failSubstitutedApprover(pairing, err);
        }
        if ((await this.revealOnce(pairing)) === 'conflict') {
          // Someone else's key is on the row, or a reveal outlived the slot holding the only
          // private key that could open what it earns: nothing here can finish this request.
          this.pairing = null;
          return { kind: 'failed', reason: 'error' };
        }
        if (this.pairing !== pairing) {
          return { kind: 'failed', reason: 'error' };
        }
        pairing.approverPub = approverPub;
        pairing.sas = await derivePairingSas(
          pairing.keypair.publicKey,
          pairing.approverPub,
          pairing.id
        );
        // Answered even when the envelope is already waiting: the digits must reach this screen
        // before the device will open a key wrapped by the peer that sent them.
        return { kind: 'confirm', sas: pairing.sas };
      }
      const approverPub = pairing.approverPub;
      if (found.envelope !== null && approverPub !== null) {
        return await this.adoptPairedKey(pairing, approverPub, found.envelope, epoch);
      }
      if (pairing.sas !== null) {
        return { kind: 'confirm', sas: pairing.sas };
      }
      return { kind: 'waiting' };
    } catch (err) {
      // Terminal only where a retry cannot help: a lost session, or a fault raised after the adopt
      // claimed this slot. An ordinary transport fault leaves the request for the next tick.
      const lostAuth = err instanceof ApiError && err.status === 401;
      if (this.pairing === pairing && !lostAuth) {
        logger.warn(`Could not poll a pairing request: ${describeThrown(err)}`, { error: err });
        return { kind: 'error' };
      }
      return await this.failPairing(err, before, epoch);
    }
  }

  /**
   * The requester's mirror of denyTamperedReveal: an approver key that is not one usable X25519
   * key can only have been substituted; the request is dropped and the row best-effort deleted.
   */
  private async failSubstitutedApprover(
    pairing: PairingRequest,
    err: unknown
  ): Promise<PairingPollResult> {
    this.pairing = null;
    logger.error(
      `Cloud sync refused a pairing approver: the key published for ${pairing.id} is not one this device can use: ${describeThrown(err)}`,
      err
    );
    await this.deps.bestEffort(
      () => this.deps.apiClient.deletePairing(pairing.id),
      'substituted pairing approver cleanup'
    );
    return { kind: 'failed', reason: 'tampered' };
  }

  /**
   * Publishes the key the create only committed to, at most once — the server refuses a second
   * reveal, and every extra one would be another chance to substitute a key under the same digits.
   */
  private async revealOnce(pairing: PairingRequest): Promise<'revealed' | 'conflict'> {
    if (pairing.revealed) {
      return 'revealed';
    }
    // Claimed before the first await, so of two polls that read the same approver key only one
    // reaches the reveal; the other proceeds to the digits, which need no server call.
    pairing.revealed = true;
    try {
      await this.deps.apiClient.revealPairing(
        pairing.id,
        encodePairingPublicKey(pairing.keypair.publicKey),
        encodePairingNonce(pairing.nonce)
      );
      return 'revealed';
    } catch (err) {
      if (err instanceof ApiError && err.code === 'pairing_conflict') {
        return 'conflict';
      }
      // Un-claimed, so the retry a non-terminal poll error allows can publish it; one that did
      // land answers conflict above rather than reaching here.
      pairing.revealed = false;
      throw err;
    }
  }

  /** Opens the peer-wrapped key and adopts it through the same tail an enroll ends with. */
  private async adoptPairedKey(
    pairing: PairingRequest,
    approverPub: PairingPublicKey,
    envelope: PeerWrappedEnvelope,
    epoch: number
  ): Promise<PairingPollResult> {
    // Claimed before the first await, so the caller's identity check and this claim are one
    // unraceable step: of two polls holding the same request, only one can reach the unwrap.
    this.pairing = null;
    const { dk, keyId } = await unwrapDataKeyFromPeer(
      pairing.keypair.privateKey,
      approverPub,
      envelope,
      pairing.id
    );
    // Persisted before the activation, not after: a disable landing inside activateWithKey rolls
    // this write back with the rest, where a later write would outlive that rollback.
    await setAsideDataKey(this.deps.keyStore);
    await persistDataKey(this.deps.keyStore, keyId, dk, pairing.userId);
    await this.deps.activateWithKey(dk, keyId, epoch, false, true);
    if (this.deps.epoch() !== epoch) {
      // activateWithKey rolled its own work back rather than adopt a key for a removed account.
      return { kind: 'failed', reason: 'error' };
    }
    if (this.deps.status() === 'signed_out') {
      // Auth loss during the initial sync: the key is on disk, but this device must reconnect, not
      // report a completed enroll the UI then repaints as signed out.
      return { kind: 'failed', reason: 'signed_out' };
    }
    // Best-effort: the row is consumed, and a lingering one only ages out at its TTL.
    await this.deps.bestEffort(
      () => this.deps.apiClient.deletePairing(pairing.id),
      'adopted pairing request cleanup'
    );
    return { kind: 'complete' };
  }

  /** Maps a poll fault through the shared enable/enroll handling, then names it for the caller. */
  private async failPairing(
    err: unknown,
    before: SyncStatus,
    epoch: number
  ): Promise<PairingPollResult> {
    this.pairing = null;
    try {
      await this.deps.handleEnableError(err, before, epoch);
    } catch (rethrown) {
      // Only the generic branch is reachable here (401/enrollSuperseded return, recovery-code
      // errors only arise from the enroll path) — this is where a pairing fault is recorded.
      logger.error(`Cloud sync pairing adoption failed: ${describeThrown(rethrown)}`, rethrown);
    }
    if (this.deps.status() === 'signed_out') {
      return { kind: 'failed', reason: 'signed_out' };
    }
    return { kind: 'failed', reason: 'error' };
  }

  /**
   * Pending requests on this account (ENG-50), for the approver's screen. `[]` unless this device
   * is active and holds the data key — only such a device can wrap it to a requester.
   */
  async listPairingRequests(): Promise<PendingPairing[]> {
    if (this.deps.status() !== 'active' || this.deps.dk() === null) {
      return [];
    }
    return this.deps.apiClient.listPairings();
  }

  /**
   * Commits this device's key to a request. No digits yet — they cover the requester's key, which
   * is still only a commitment at this point; `pollApproval` earns them. Pending again for a
   * request this session already holds. Null once the row is gone or another session already
   * committed — both are the same `pairing_not_found`/`pairing_conflict` the server answers, and
   * neither deletes the row, since it may belong to a live approver; anything else rethrows.
   */
  async commitPairing(id: string): Promise<{ pending: true } | null> {
    // Already committed in this session: the server refuses a second commit, and the live slot
    // below still holds the keypair the first one used.
    if (this.approving?.id === id) {
      return { pending: true };
    }
    const rows = await this.deps.apiClient.listPairings();
    const row = rows.find((candidate) => candidate.id === id);
    if (row === undefined) {
      return null;
    }
    const keypair = await generatePairingKeypair();
    try {
      await this.deps.apiClient.commitPairing(id, encodePairingPublicKey(keypair.publicKey));
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === 'pairing_conflict' || err.code === 'pairing_not_found')
      ) {
        // Never delete here: the row can be this device's own dead slot after a worker
        // restart, or another approver's live commit — the two are indistinguishable.
        if (this.approving?.id !== id) {
          logger.warn(`Cloud sync could not commit to a pairing request it cannot finish: ${id}`);
        }
        return null;
      }
      throw err;
    }
    // The commitment as it stood before this device's key existed on the server — the whole point
    // of the exchange: nothing revealed afterwards can be ground against what is already fixed.
    this.approving = {
      id,
      keypair,
      commitment: row.requesterCommitment,
      verified: null,
    };
    return { pending: true };
  }

  /**
   * One poll of the request this device committed to (callers loop it while their screen is up).
   * Never throws, like `pollPairing`: a transport fault is `error`, which leaves the request
   * standing for the next tick, and only `failed` means no retry can help. The caller may pass the
   * row its own list poll already fetched, so the wait costs one poll stream against the shared
   * rate bucket, not two.
   */
  async pollApproval(id: string, row?: PendingPairing): Promise<PairingApprovalResult> {
    const approving = this.approving;
    if (approving === null || approving.id !== id) {
      return { kind: 'failed', reason: 'gone' };
    }
    if (approving.verified !== null) {
      return { kind: 'confirm', sas: approving.verified.sas };
    }
    try {
      return await this.resolveApproval(id, approving, row);
    } catch (err) {
      // Non-terminal, and the slot is untouched: an offline tick must not end a live request.
      logger.warn(`Could not poll a pairing approval: ${describeThrown(err)}`, { error: err });
      return { kind: 'error' };
    }
  }

  /** Reads the row this device committed to and turns its reveal into digits, or into a refusal. */
  private async resolveApproval(
    id: string,
    approving: PairingApproval,
    prefetched?: PendingPairing
  ): Promise<PairingApprovalResult> {
    // The approver's list poll already fetched this row every tick; reuse it rather than re-list the
    // whole account against the same rate bucket the pull loop shares.
    const row = prefetched ?? (await this.findPairingRow(id));
    // Two overlapping polls, or a deny/disable landing across the list call: this slot no longer
    // speaks for what the engine is doing.
    if (this.approving !== approving) {
      return { kind: 'failed', reason: 'gone' };
    }
    if (row === undefined) {
      this.approving = null;
      return { kind: 'failed', reason: 'gone' };
    }
    if (row.id !== id) {
      // A page-realm message may carry any row; verifying one here would refuse the request
      // this slot is actually polling, on evidence nobody vouched for.
      logger.error(`Cloud sync ignored a pairing row for ${row.id} while polling ${id}`);
      return { kind: 'waiting' };
    }
    if (row.requesterPublicKey === null || row.requesterNonce === null) {
      return { kind: 'waiting' };
    }
    // A string, not just non-null: neither the relay's JSON nor a page-realm message is validated,
    // and a non-string fed to the decode below reads back as the peer substituting a key.
    if (typeof row.requesterPublicKey !== 'string' || typeof row.requesterNonce !== 'string') {
      logger.error(`Cloud sync ignored a malformed pairing row for ${id}`);
      return { kind: 'waiting' };
    }
    let requesterPub: PairingPublicKey;
    let requesterNonce: PairingNonce;
    try {
      requesterPub = decodePairingPublicKey(row.requesterPublicKey);
      requesterNonce = decodePairingNonce(row.requesterNonce);
    } catch {
      // Relay data that will not decode to one usable key is a substitution, not a transport fault.
      return await this.denyTamperedReveal(id, approving);
    }
    const matches = await verifyPairingCommitment(
      approving.commitment,
      requesterPub,
      requesterNonce
    );
    if (!matches) {
      return await this.denyTamperedReveal(id, approving);
    }
    const sas = await derivePairingSas(requesterPub, approving.keypair.publicKey, id);
    // Assigned once, after the derive resolves: a rejected derive leaves the slot unverified rather
    // than holding a key to wrap with no digits ever shown.
    if (this.approving !== approving) {
      return { kind: 'failed', reason: 'gone' };
    }
    approving.verified = { requesterPub, sas };
    return { kind: 'confirm', sas };
  }

  /** The pending request with this id from a fresh account-wide list, or undefined if gone. */
  private async findPairingRow(id: string): Promise<PendingPairing | undefined> {
    const rows = await this.deps.apiClient.listPairings();
    return rows.find((candidate) => candidate.id === id);
  }

  /**
   * A revealed key the commitment does not cover means the relay swapped it, so the row is deleted
   * rather than left for a retry to land on. Answered as its own reason, not as an ordinary
   * failure: this is the substitution the whole exchange exists to catch, and the caller says so.
   */
  private async denyTamperedReveal(
    id: string,
    approving: PairingApproval
  ): Promise<PairingApprovalResult> {
    if (this.approving === approving) {
      this.approving = null;
    }
    logger.error(
      'Cloud sync refused a pairing request: the other device revealed a key it had not committed to'
    );
    await this.deps.bestEffort(
      () => this.deps.apiClient.deletePairing(id),
      'tampered pairing request cleanup'
    );
    return { kind: 'failed', reason: 'tampered' };
  }

  /**
   * Wraps the account's data key to the request this device committed to and uploads it. False
   * without a VERIFIED reveal in hand: a stale id, a second call, a device that lost its key
   * between commit and approve, or digits nobody has been shown yet.
   */
  async approvePairing(id: string): Promise<boolean> {
    if (this.approving === null || this.approving.id !== id) {
      return false;
    }
    const dk = this.deps.dk();
    const keyId = this.deps.keyId();
    if (dk === null || keyId === null) {
      return false;
    }
    const { keypair, verified } = this.approving;
    if (verified === null) {
      return false;
    }
    const envelope = await wrapDataKeyToPeer(
      keypair.privateKey,
      verified.requesterPub,
      dk,
      keyId,
      id
    );
    await this.deps.apiClient.putPairingEnvelope(id, envelope);
    this.approving = null;
    return true;
  }

  /** Declines a pending request. deletePairing is 404-tolerant, so a stale id is a no-op. */
  async denyPairing(id: string): Promise<void> {
    await this.deps.apiClient.deletePairing(id);
    if (this.approving !== null && this.approving.id === id) {
      this.approving = null;
    }
  }
}
