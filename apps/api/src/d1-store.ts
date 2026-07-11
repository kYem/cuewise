import { randomToken, sha256Hex } from './crypto-utils';
import type {
  AuthCodePayload,
  Identity,
  PushRecord,
  Session,
  SyncRecord,
  SyncStore,
} from './store';

export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const AUTH_CODE_TTL_MS = 60_000;

export class D1SyncStore implements SyncStore {
  constructor(
    private db: D1Database,
    private now: () => number = Date.now
  ) {}

  private async selectIdentityUserId(identity: Identity): Promise<string | null> {
    const row = await this.db
      .prepare('SELECT user_id FROM identities WHERE provider = ? AND provider_sub = ?')
      .bind(identity.provider, identity.providerSub)
      .first<{ user_id: string }>();
    return row === null ? null : row.user_id;
  }

  async findOrCreateUser(identity: Identity): Promise<string> {
    const existing = await this.selectIdentityUserId(identity);
    if (existing !== null) {
      return existing;
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

  async createSession(userId: string, deviceName: string): Promise<string> {
    const token = randomToken();
    const ts = this.now();
    await this.db
      .prepare(
        'INSERT INTO tokens (token_hash, user_id, device_name, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(await sha256Hex(token), userId, deviceName, ts + SESSION_TTL_MS, ts)
      .run();
    return token;
  }

  async lookupSession(rawToken: string): Promise<Session | null> {
    const tokenHash = await sha256Hex(rawToken);
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

  async revokeSession(rawToken: string): Promise<void> {
    await this.db
      .prepare('UPDATE tokens SET revoked_at = ? WHERE token_hash = ?')
      .bind(this.now(), await sha256Hex(rawToken))
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
    const row = await this.db
      .prepare(
        'UPDATE auth_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING payload, code_challenge'
      )
      .bind(ts, codeHash, ts)
      .first<{ payload: string; code_challenge: string | null }>();
    if (row === null) {
      return null;
    }
    // mintAuthCode always writes a code_challenge; a row with none is only reachable via
    // a manual DB edit, so reject it fail-closed rather than treating null as "no PKCE".
    if (row.code_challenge === null) {
      return null;
    }
    return {
      payload: JSON.parse(row.payload) as AuthCodePayload,
      codeChallenge: row.code_challenge,
    };
  }

  async applyChanges(userId: string, changes: PushRecord[]): Promise<number> {
    const ts = this.now();
    const stmts: D1PreparedStatement[] = [];
    for (const change of changes) {
      stmts.push(
        this.db.prepare('UPDATE users SET last_seq = last_seq + 1 WHERE id = ?').bind(userId)
      );
      stmts.push(
        this.db
          .prepare(
            `INSERT INTO records (user_id, collection, entity_id, seq, ciphertext, deleted, client_updated_at, server_received_at)
             VALUES (?, ?, ?, (SELECT last_seq FROM users WHERE id = ?), ?, ?, ?, ?)
             ON CONFLICT (user_id, collection, entity_id) DO UPDATE SET
               seq = excluded.seq, ciphertext = excluded.ciphertext, deleted = excluded.deleted,
               client_updated_at = excluded.client_updated_at, server_received_at = excluded.server_received_at`
          )
          .bind(
            userId,
            change.collection,
            change.entityId,
            userId,
            change.ciphertext,
            change.deleted ? 1 : 0,
            change.clientUpdatedAt,
            ts
          )
      );
    }
    stmts.push(this.db.prepare('SELECT last_seq FROM users WHERE id = ?').bind(userId));
    // Must stay a single db.batch: each INSERT's subquery relies on its immediately-
    // preceding UPDATE for the next seq; splitting this reintroduces a multi-device race.
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
        'SELECT collection, entity_id, seq, ciphertext, deleted, client_updated_at FROM records WHERE user_id = ? AND seq > ? ORDER BY seq ASC'
      )
      .bind(userId, since)
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
    const { records } = await this.listChanges(userId, 0);
    return { records };
  }

  async deleteUser(userId: string): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM records WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM tokens WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM identities WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
    ]);
  }

  // Single UPDATE...RETURNING with CASE keeps the reset-or-increment atomic within D1's
  // implicit per-statement transaction (select-then-update would race under concurrent hits).
  async bumpRateWindow(
    tokenHash: string,
    windowMs: number
  ): Promise<{ count: number; windowStart: number }> {
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
      throw new Error('bumpRateWindow: unknown token');
    }
    return { count: row.window_count, windowStart: row.window_start };
  }
}
