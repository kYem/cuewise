export interface Identity {
  provider: string;
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
  mintAuthCode(payload: AuthCodePayload): Promise<string>;
  consumeAuthCode(rawCode: string): Promise<AuthCodePayload | null>;
  applyChanges(userId: string, changes: PushRecord[]): Promise<number>;
  listChanges(userId: string, since: number): Promise<{ records: SyncRecord[]; cursor: number }>;
  exportUser(userId: string): Promise<{ records: SyncRecord[] }>;
  deleteUser(userId: string): Promise<void>;
  bumpRateWindow(tokenHash: string, windowMs: number): Promise<number>;
}
