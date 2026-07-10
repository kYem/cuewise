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

  async findOrCreateUser(identity: Identity): Promise<string> {
    const existing = await this.db
      .prepare('SELECT user_id FROM identities WHERE provider = ? AND provider_sub = ?')
      .bind(identity.provider, identity.providerSub)
      .first<{ user_id: string }>();
    if (existing !== null) {
      return existing.user_id;
    }
    const userId = crypto.randomUUID();
    const ts = this.now();
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
    await this.db
      .prepare(
        'INSERT INTO auth_codes (code_hash, payload, expires_at, code_challenge) VALUES (?, ?, ?, ?)'
      )
      .bind(
        await sha256Hex(code),
        JSON.stringify(payload),
        this.now() + AUTH_CODE_TTL_MS,
        codeChallenge
      )
      .run();
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
    // Legacy rows minted before PKCE binding have no challenge and can never be redeemed.
    if (row.code_challenge === null) {
      return null;
    }
    return {
      payload: JSON.parse(row.payload) as AuthCodePayload,
      codeChallenge: row.code_challenge,
    };
  }

  async applyChanges(_userId: string, _changes: PushRecord[]): Promise<number> {
    throw new Error('not implemented');
  }

  async listChanges(
    _userId: string,
    _since: number
  ): Promise<{ records: SyncRecord[]; cursor: number }> {
    throw new Error('not implemented');
  }

  async exportUser(_userId: string): Promise<{ records: SyncRecord[] }> {
    throw new Error('not implemented');
  }

  async deleteUser(_userId: string): Promise<void> {
    throw new Error('not implemented');
  }

  async bumpRateWindow(_tokenHash: string, _windowMs: number): Promise<number> {
    throw new Error('not implemented');
  }
}
