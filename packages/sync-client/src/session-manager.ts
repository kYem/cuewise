import type { KeyValueStore, StorageResult } from '@cuewise/shared';

export const SYNC_SESSION_KEY = 'syncSession';

/** Persists the cloud sync session token; always uses the 'local' storage area. */
export class SessionManager {
  constructor(private store: KeyValueStore) {}

  async getToken(): Promise<string | null> {
    return this.store.get<string>(SYNC_SESSION_KEY, 'local');
  }

  async isSignedIn(): Promise<boolean> {
    return (await this.getToken()) !== null;
  }

  async saveToken(token: string): Promise<StorageResult> {
    return this.store.set(SYNC_SESSION_KEY, token, 'local');
  }

  async clear(): Promise<void> {
    await this.store.remove(SYNC_SESSION_KEY, 'local');
  }
}
