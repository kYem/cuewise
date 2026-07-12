import { logger } from '@cuewise/shared';
import {
  hashSessionToken,
  type RawSessionToken,
  randomSessionToken,
  randomToken,
  type SessionTokenHash,
  sha256Hex,
} from './crypto-utils';
import {
  type AuthCodePayload,
  type Identity,
  type PushRecord,
  type Session,
  StorageQuotaExceededError,
  type SyncRecord,
  type SyncStore,
} from './store';

export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const AUTH_CODE_TTL_MS = 60_000;
// Caps one pull/export query so a large account can't force the worker to buffer an unbounded
// result set into memory (OOM) — the caller pages by re-pulling from the returned cursor.
export const MAX_CHANGES_PAGE_SIZE = 500;
// Safety rail against one account filling the shared D1. Generous enough that only deliberate
// abuse hits it; checked conservatively (all pushed rows treated as new).
export const MAX_RECORDS_PER_USER = 100_000;
// Tombstones older than this are safe to reclaim: a device idle longer than the session TTL is
// logged out and re-bootstraps from since=0, so it never needs the tombstone to learn of a delete.
export const TOMBSTONE_RETENTION_MS = SESSION_TTL_MS;

export interface D1SyncStoreLimits {
  maxRecordsPerUser?: number;
  changesPageSize?: number;
}

export class D1SyncStore implements SyncStore {
  private maxRecordsPerUser: number;
  private changesPageSize: number;

  // Limits are an options object (not positional) so the two same-typed numbers can't be swapped;
  // overridable so tests exercise the caps without materializing 100k rows / 500-row pages.
  constructor(
    private db: D1Database,
    private now: () => number = Date.now,
    limits: D1SyncStoreLimits = {}
  ) {
    this.maxRecordsPerUser = limits.maxRecordsPerUser ?? MAX_RECORDS_PER_USER;
    this.changesPageSize = limits.changesPageSize ?? MAX_CHANGES_PAGE_SIZE;
  }

  private async selectIdentityUserId(identity: Identity): Promise<string | null> {
    const row = await this.db
      .prepare('SELECT user_id FROM identities WHERE provider = ? AND provider_sub = ?')
      .bind(identity.provider, identity.providerSub)
      .first<{ user_id: string }>();
    return row === null ? null : row.user_id;
  }

  async findOrCreateUser(identity: Identity): Promise<string> {
    const existing = await this.db
      .prepare('SELECT user_id, email FROM identities WHERE provider = ? AND provider_sub = ?')
      .bind(identity.provider, identity.providerSub)
      .first<{ user_id: string; email: string | null }>();
    if (existing !== null) {
      // Callers only ever pass a verified email; refresh both rows so a changed
      // or newly-verified address on a later sign-in doesn't stay stale forever.
      if (identity.email !== undefined && identity.email !== existing.email) {
        await this.db.batch([
          this.db
            .prepare('UPDATE identities SET email = ? WHERE provider = ? AND provider_sub = ?')
            .bind(identity.email, identity.provider, identity.providerSub),
          this.db
            .prepare('UPDATE users SET email = ? WHERE id = ?')
            .bind(identity.email, existing.user_id),
        ]);
      }
      return existing.user_id;
    }
    const userId = crypto.randomUUID();
    const ts = this.now();
    try {
      await this.db.batch([
        this.db
          .prepare('INSERT INTO users (id, email, last_seq, created_at) VALUES (?, ?, 0, ?)')
          .bind(userId, identity.email ?? null, ts),
        this.db
          .prepare(
            'INSERT INTO identities (provider, provider_sub, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)'
          )
          .bind(identity.provider, identity.providerSub, userId, identity.email ?? null, ts),
      ]);
    } catch (err) {
      // db.batch is transactional, so a losing concurrent insert leaves no orphan users
      // row — re-select and return the winner's user_id instead of surfacing a 500.
      const raced = await this.selectIdentityUserId(identity);
      if (raced !== null) {
        return raced;
      }
      throw err;
    }
    return userId;
  }

  async createSession(userId: string, deviceName: string): Promise<RawSessionToken> {
    const token = randomSessionToken();
    const ts = this.now();
    await this.db
      .prepare(
        'INSERT INTO tokens (token_hash, user_id, device_name, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(await hashSessionToken(token), userId, deviceName, ts + SESSION_TTL_MS, ts)
      .run();
    return token;
  }

  async lookupSession(rawToken: RawSessionToken): Promise<Session | null> {
    const tokenHash = await hashSessionToken(rawToken);
    const ts = this.now();
    const row = await this.db
      .prepare(
        'SELECT user_id FROM tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?'
      )
      .bind(tokenHash, ts)
      .first<{ user_id: string }>();
    if (row === null) {
      return null;
    }
    await this.db
      .prepare('UPDATE tokens SET last_used_at = ?, expires_at = ? WHERE token_hash = ?')
      .bind(ts, ts + SESSION_TTL_MS, tokenHash)
      .run();
    return { userId: row.user_id, tokenHash };
  }

  async revokeSession(rawToken: RawSessionToken): Promise<void> {
    await this.db
      .prepare('UPDATE tokens SET revoked_at = ? WHERE token_hash = ?')
      .bind(this.now(), await hashSessionToken(rawToken))
      .run();
  }

  async mintAuthCode(payload: AuthCodePayload, codeChallenge: string): Promise<string> {
    const code = randomToken();
    const codeHash = await sha256Hex(code);
    const ts = this.now();
    // Best-effort PII sweep: expired codes are purged on the next mint call, not by a
    // timer, so an unredeemed row can outlive its 60s TTL until someone else authenticates.
    await this.db.batch([
      this.db.prepare('DELETE FROM auth_codes WHERE expires_at <= ?').bind(ts),
      this.db
        .prepare(
          'INSERT INTO auth_codes (code_hash, payload, expires_at, code_challenge) VALUES (?, ?, ?, ?)'
        )
        .bind(codeHash, JSON.stringify(payload), ts + AUTH_CODE_TTL_MS, codeChallenge),
    ]);
    return code;
  }

  async consumeAuthCode(
    rawCode: string
  ): Promise<{ payload: AuthCodePayload; codeChallenge: string } | null> {
    const codeHash = await sha256Hex(rawCode);
    const ts = this.now();
    // DELETE (not mark-used) so a redeemed code's PII payload is gone at once, not left for the
    // sweep; the single DELETE ... RETURNING stays atomic, so concurrent redeems yield one row.
    const row = await this.db
      .prepare(
        'DELETE FROM auth_codes WHERE code_hash = ? AND expires_at > ? RETURNING payload, code_challenge'
      )
      .bind(codeHash, ts)
      .first<{ payload: string; code_challenge: string | null }>();
    if (row === null) {
      return null;
    }
    // A null code_challenge is a broken invariant (bad migration/manual edit), not client error:
    // fail closed AND loud, else every Apple sign-in 401s silently while each attempt burns a code.
    if (row.code_challenge === null) {
      logger.error(
        'consumeAuthCode: auth_codes row has a null code_challenge (invariant violation)'
      );
      return null;
    }
    return {
      payload: JSON.parse(row.payload) as AuthCodePayload,
      codeChallenge: row.code_challenge,
    };
  }

  async applyChanges(userId: string, changes: PushRecord[]): Promise<number> {
    const ts = this.now();
    const n = changes.length;
    if (n > 0) {
      // Conservative pre-check: treats every pushed record as a potential new row. Racy against a
      // concurrent push (both can pass near the cap), but the overshoot is bounded by one batch.
      const countRow = await this.db
        .prepare('SELECT COUNT(*) AS count FROM records WHERE user_id = ?')
        .bind(userId)
        .first<{ count: number }>();
      const existing = countRow === null ? 0 : countRow.count;
      if (existing + n > this.maxRecordsPerUser) {
        throw new StorageQuotaExceededError(
          `push of ${n} records would exceed the ${this.maxRecordsPerUser}-record per-user cap`
        );
      }
    }
    const stmts: D1PreparedStatement[] = [];
    // Reserve all N seqs in one write; guarded so a no-op push (n=0) issues no write at all.
    if (n > 0) {
      stmts.push(
        this.db.prepare('UPDATE users SET last_seq = last_seq + ? WHERE id = ?').bind(n, userId)
      );
    }
    changes.forEach((change, i) => {
      stmts.push(
        this.db
          .prepare(
            `INSERT INTO records (user_id, collection, entity_id, seq, ciphertext, deleted, client_updated_at, server_received_at)
             VALUES (?, ?, ?, (SELECT last_seq FROM users WHERE id = ?) - ?, ?, ?, ?, ?)
             ON CONFLICT (user_id, collection, entity_id) DO UPDATE SET
               seq = excluded.seq, ciphertext = excluded.ciphertext, deleted = excluded.deleted,
               client_updated_at = excluded.client_updated_at, server_received_at = excluded.server_received_at`
          )
          .bind(
            userId,
            change.collection,
            change.entityId,
            userId,
            n - 1 - i,
            change.ciphertext,
            change.deleted ? 1 : 0,
            change.clientUpdatedAt,
            ts
          )
      );
    });
    stmts.push(this.db.prepare('SELECT last_seq FROM users WHERE id = ?').bind(userId));
    // Must stay a single db.batch: every INSERT reads the post-UPDATE last_seq set by the
    // leading UPDATE in this same batch; splitting this reintroduces a multi-device race.
    const results = await this.db.batch<{ last_seq: number }>(stmts);
    const tail = results[results.length - 1];
    if (tail === undefined || tail.results[0] === undefined) {
      throw new Error('applyChanges: missing cursor result');
    }
    return tail.results[0].last_seq;
  }

  async listChanges(
    userId: string,
    since: number
  ): Promise<{ records: SyncRecord[]; cursor: number }> {
    const { results } = await this.db
      .prepare(
        'SELECT collection, entity_id, seq, ciphertext, deleted, client_updated_at FROM records WHERE user_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?'
      )
      .bind(userId, since, this.changesPageSize)
      .all<{
        collection: string;
        entity_id: string;
        seq: number;
        ciphertext: string;
        deleted: number;
        client_updated_at: number;
      }>();
    const records = results.map((r) => ({
      collection: r.collection,
      entityId: r.entity_id,
      seq: r.seq,
      ciphertext: r.ciphertext,
      deleted: r.deleted === 1,
      clientUpdatedAt: r.client_updated_at,
    }));
    const last = records[records.length - 1];
    return { records, cursor: last === undefined ? since : last.seq };
  }

  async exportUser(userId: string): Promise<{ records: SyncRecord[] }> {
    // Page so each D1 query stays bounded; the full set is still assembled in memory, acceptable
    // for this rare one-shot. Streaming is the follow-up for huge accounts.
    const records: SyncRecord[] = [];
    let since = 0;
    for (;;) {
      const page = await this.listChanges(userId, since);
      records.push(...page.records);
      if (page.records.length < this.changesPageSize) {
        break;
      }
      since = page.cursor;
    }
    return { records };
  }

  async deleteUser(userId: string): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM records WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM tokens WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM identities WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM key_envelopes WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
    ]);
  }

  async purgeTombstones(retentionMs: number): Promise<number> {
    // Reclaims deleted-row space across all users; the partial idx_records_tombstone keeps this
    // off a full-table scan. server_received_at (not client time) is the trustworthy clock.
    const cutoff = this.now() - retentionMs;
    const result = await this.db
      .prepare('DELETE FROM records WHERE deleted = 1 AND server_received_at < ?')
      .bind(cutoff)
      .run();
    return result.meta.changes ?? 0;
  }

  async getKeyEnvelope(
    userId: string,
    kind: string
  ): Promise<{ envelope: string; updatedAt: number } | null> {
    const row = await this.db
      .prepare('SELECT envelope, updated_at FROM key_envelopes WHERE user_id = ? AND kind = ?')
      .bind(userId, kind)
      .first<{ envelope: string; updated_at: number }>();
    if (row === null) {
      return null;
    }
    return { envelope: row.envelope, updatedAt: row.updated_at };
  }

  async putKeyEnvelope(userId: string, kind: string, envelope: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO key_envelopes (user_id, kind, envelope, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, kind) DO UPDATE SET envelope = excluded.envelope, updated_at = excluded.updated_at`
      )
      .bind(userId, kind, envelope, this.now())
      .run();
  }

  // Single UPDATE...RETURNING with CASE keeps the reset-or-increment atomic within D1's
  // implicit per-statement transaction (select-then-update would race under concurrent hits).
  async bumpRateWindow(
    tokenHash: SessionTokenHash,
    windowMs: number
  ): Promise<{ count: number; resetInMs: number } | null> {
    const ts = this.now();
    const row = await this.db
      .prepare(
        `UPDATE tokens
         SET
           window_start = CASE WHEN ? - window_start > ? THEN ? ELSE window_start END,
           window_count = CASE WHEN ? - window_start > ? THEN 1 ELSE window_count + 1 END
         WHERE token_hash = ?
         RETURNING window_start, window_count`
      )
      .bind(ts, windowMs, ts, ts, windowMs, tokenHash)
      .first<{ window_start: number; window_count: number }>();
    if (row === null) {
      // Reachable only if the token row was physically deleted (concurrent account deletion) —
      // this UPDATE filters on token_hash alone, and revocation leaves the row in place.
      return null;
    }
    return {
      count: row.window_count,
      resetInMs: Math.max(0, row.window_start + windowMs - ts),
    };
  }
}
