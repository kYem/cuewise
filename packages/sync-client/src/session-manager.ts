import type { KeyValueStore, StorageResult } from '@cuewise/shared';

export const SYNC_SESSION_KEY = 'syncSession';

/**
 * Always the 'local' area — the token is a per-device credential; 'sync' would replicate
 * it across the user's browsers, defeating per-device sessions and revocation.
 */
export class SessionManager {
  constructor(private store: KeyValueStore) {}

  async getToken(): Promise<string | null> {
    return this.store.get<string>(SYNC_SESSION_KEY, 'local');
  }

  async isSignedIn(): Promise<boolean> {
    return (await this.getToken()) !== null;
  }

  // Callers must check the returned StorageResult.success — a quota failure here means
  // "authenticated but not persisted", not a successful sign-in.
  async saveToken(token: string): Promise<StorageResult> {
    return this.store.set(SYNC_SESSION_KEY, token, 'local');
  }

  async clear(): Promise<void> {
    await this.store.remove(SYNC_SESSION_KEY, 'local');
  }
}
