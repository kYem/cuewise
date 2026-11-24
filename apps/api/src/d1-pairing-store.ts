import type {
  PairingCommitment,
  PairingNonceB64,
  PairingPublicKeyB64,
  PeerWrappedEnvelope,
} from '@cuewise/crypto';
import type { SessionTokenHash } from './crypto-utils';
import { PAIRING_TTL_MS, type PairingForRequester, type PendingPairing } from './store';

export class D1PairingStore {
  constructor(protected readonly db: D1Database) {}

  // One batch: replacing the caller's own prior row first means the unique index on
  // requester_session_id never sees the new INSERT collide with it.
  async createPairing(
    userId: string,
    requesterTokenHash: SessionTokenHash,
    commitment: PairingCommitment,
    now: number
  ): Promise<{ id: string; expiresAt: number }> {
    const expiresAt = now + PAIRING_TTL_MS;
    const results = await this.db.batch<{ id: string; expires_at: number }>([
      this.db
        .prepare(
          'DELETE FROM pairings WHERE requester_session_id = (SELECT id FROM tokens WHERE token_hash = ?)'
        )
        .bind(requesterTokenHash),
      this.db
        .prepare(
          `INSERT INTO pairings (user_id, requester_session_id, requester_commitment, created_at, expires_at)
           VALUES (?, (SELECT id FROM tokens WHERE token_hash = ?), ?, ?, ?)
           RETURNING id, expires_at`
        )
        .bind(userId, requesterTokenHash, commitment, now, expiresAt),
    ]);
    const inserted = results[1];
    if (inserted === undefined || inserted.results[0] === undefined) {
      throw new Error('createPairing: missing insert result');
    }
    return { id: inserted.results[0].id, expiresAt: inserted.results[0].expires_at };
  }

  async getPairingForRequester(
    userId: string,
    id: string,
    now: number
  ): Promise<PairingForRequester | null> {
    const row = await this.db
      .prepare(
        'SELECT id, approver_public_key, envelope, expires_at FROM pairings WHERE id = ? AND user_id = ? AND expires_at > ?'
      )
      .bind(id, userId, now)
      .first<{
        id: string;
        approver_public_key: PairingPublicKeyB64 | null;
        envelope: PeerWrappedEnvelope | null;
        expires_at: number;
      }>();
    if (row === null) {
      return null;
    }
    return {
      id: row.id,
      approverPublicKey: row.approver_public_key,
      envelope: row.envelope,
      expiresAt: row.expires_at,
    };
  }

  async listPendingPairings(
    userId: string,
    excludeTokenHash: SessionTokenHash,
    now: number
  ): Promise<PendingPairing[]> {
    const { results } = await this.db
      .prepare(
        `SELECT p.id, p.requester_commitment, p.requester_public_key, p.requester_nonce, p.created_at, t.device_name
         FROM pairings p JOIN tokens t ON t.id = p.requester_session_id
         WHERE p.user_id = ? AND p.expires_at > ? AND p.envelope IS NULL
           AND p.requester_session_id <> (SELECT id FROM tokens WHERE token_hash = ?)
         ORDER BY p.created_at ASC`
      )
      .bind(userId, now, excludeTokenHash)
      .all<{
        id: string;
        requester_commitment: PairingCommitment;
        requester_public_key: PairingPublicKeyB64 | null;
        requester_nonce: PairingNonceB64 | null;
        created_at: number;
        device_name: string;
      }>();
    return results.map((row) => ({
      id: row.id,
      deviceName: row.device_name,
      requesterCommitment: row.requester_commitment,
      requesterPublicKey: row.requester_public_key,
      requesterNonce: row.requester_nonce,
      createdAt: row.created_at,
    }));
  }

  // 0 rows changed is ambiguous between "no such live row" and "already committed by someone
  // else"; the re-read after a failed update is what tells those two apart.
  async commitPairing(
    userId: string,
    id: string,
    approverTokenHash: SessionTokenHash,
    publicKey: PairingPublicKeyB64,
    now: number
  ): Promise<'committed' | 'conflict' | 'not_found'> {
    const res = await this.db
      .prepare(
        `UPDATE pairings SET approver_session_id = (SELECT id FROM tokens WHERE token_hash = ?), approver_public_key = ?
         WHERE id = ? AND user_id = ? AND approver_session_id IS NULL AND expires_at > ?`
      )
      .bind(approverTokenHash, publicKey, id, userId, now)
      .run();
    if ((res.meta.changes ?? 0) > 0) {
      return 'committed';
    }
    const row = await this.db
      .prepare('SELECT id FROM pairings WHERE id = ? AND user_id = ? AND expires_at > ?')
      .bind(id, userId, now)
      .first<{ id: string }>();
    return row === null ? 'not_found' : 'conflict';
  }

  // Same ambiguous-zero-rows pattern as commitPairing: WHERE also requires the caller to be the
  // requester with the approver already committed — an early or wrong-session reveal is 'conflict' too.
  async revealPairing(
    userId: string,
    id: string,
    requesterTokenHash: SessionTokenHash,
    publicKey: PairingPublicKeyB64,
    nonce: PairingNonceB64,
    now: number
  ): Promise<'revealed' | 'conflict' | 'not_found'> {
    const res = await this.db
      .prepare(
        `UPDATE pairings SET requester_public_key = ?, requester_nonce = ?
         WHERE id = ? AND user_id = ? AND expires_at > ?
           AND requester_session_id = (SELECT id FROM tokens WHERE token_hash = ?)
           AND approver_public_key IS NOT NULL
           AND requester_public_key IS NULL`
      )
      .bind(publicKey, nonce, id, userId, now, requesterTokenHash)
      .run();
    if ((res.meta.changes ?? 0) > 0) {
      return 'revealed';
    }
    const row = await this.db
      .prepare('SELECT id FROM pairings WHERE id = ? AND user_id = ? AND expires_at > ?')
      .bind(id, userId, now)
      .first<{ id: string }>();
    return row === null ? 'not_found' : 'conflict';
  }

  // Same ambiguous-zero-rows pattern as commitPairing: WHERE also requires the caller to be the
  // committed approver with the reveal already stored — an early or wrong-session PUT is 'conflict' too.
  async putPairingEnvelope(
    userId: string,
    id: string,
    approverTokenHash: SessionTokenHash,
    envelope: PeerWrappedEnvelope,
    now: number
  ): Promise<'stored' | 'conflict' | 'not_found'> {
    const res = await this.db
      .prepare(
        `UPDATE pairings SET envelope = ?
         WHERE id = ? AND user_id = ? AND expires_at > ?
           AND approver_session_id = (SELECT id FROM tokens WHERE token_hash = ?)
           AND requester_public_key IS NOT NULL`
      )
      .bind(envelope, id, userId, now, approverTokenHash)
      .run();
    if ((res.meta.changes ?? 0) > 0) {
      return 'stored';
    }
    const row = await this.db
      .prepare('SELECT id FROM pairings WHERE id = ? AND user_id = ? AND expires_at > ?')
      .bind(id, userId, now)
      .first<{ id: string }>();
    return row === null ? 'not_found' : 'conflict';
  }

  async deletePairing(userId: string, id: string): Promise<boolean> {
    const res = await this.db
      .prepare('DELETE FROM pairings WHERE id = ? AND user_id = ?')
      .bind(id, userId)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }

  async purgeExpiredPairings(now: number): Promise<number> {
    const res = await this.db.prepare('DELETE FROM pairings WHERE expires_at <= ?').bind(now).run();
    return res.meta.changes ?? 0;
  }
}
