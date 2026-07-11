export interface Identity {
  provider: 'google' | 'apple' | 'dev';
  providerSub: string;
  email?: string;
}

export interface Session {
  userId: string;
  tokenHash: string;
}

export interface AuthCodePayload {
  provider: 'apple';
  providerSub: string;
  email?: string;
}

// Mirrors PushRecord in packages/sync-client/src/types.ts — keep both in sync when this shape changes.
export interface PushRecord {
  collection: string;
  entityId: string;
  ciphertext: string;
  clientUpdatedAt: number;
  deleted: boolean;
}

export interface SyncRecord extends PushRecord {
  seq: number;
}

export interface SyncStore {
  findOrCreateUser(identity: Identity): Promise<string>;
  createSession(userId: string, deviceName: string): Promise<string>;
  lookupSession(rawToken: string): Promise<Session | null>;
  revokeSession(rawToken: string): Promise<void>;
  mintAuthCode(payload: AuthCodePayload, codeChallenge: string): Promise<string>;
  consumeAuthCode(
    rawCode: string
  ): Promise<{ payload: AuthCodePayload; codeChallenge: string } | null>;
  applyChanges(userId: string, changes: PushRecord[]): Promise<number>;
  listChanges(userId: string, since: number): Promise<{ records: SyncRecord[]; cursor: number }>;
  exportUser(userId: string): Promise<{ records: SyncRecord[] }>;
  deleteUser(userId: string): Promise<void>;
  // Returns null when the token row no longer exists (e.g. revoked/deleted mid-request)
  // so callers can 401 instead of treating it as a server error.
  bumpRateWindow(
    tokenHash: string,
    windowMs: number
  ): Promise<{ count: number; resetInMs: number } | null>;
}
