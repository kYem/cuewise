import type { KeyValueStore, StorageResult } from '@cuewise/shared';
import { StorageReadError } from './storage-read-error';

export const SYNC_SESSION_KEY = 'syncSession';

/**
 * Always the 'local' area — the token is a per-device credential; 'sync' would replicate
 * it across the user's browsers, defeating per-device sessions and revocation.
 */
export class SessionManager {
  constructor(private store: KeyValueStore) {}

  /**
   * Null when no usable token is stored. A failed read throws instead, or the unauthenticated
   * request's 401 would end a live session; an unreadable token can never authenticate anyway.
   */
  async getToken(): Promise<string | null> {
    const stored = await this.store.getMany([SYNC_SESSION_KEY], 'local');
    if (stored === null) {
      throw new StorageReadError(SYNC_SESSION_KEY);
    }
    const entry = stored[SYNC_SESSION_KEY];
    if (entry === undefined || !entry.readable) {
      return null;
    }
    return entry.value as string;
  }

  async isSignedIn(): Promise<boolean> {
    return (await this.getToken()) !== null;
  }

  // Callers must check the returned StorageResult.success — a quota failure here means
  // "authenticated but not persisted", not a successful sign-in.
  async saveToken(token: string): Promise<StorageResult> {
    return this.store.set(SYNC_SESSION_KEY, token, 'local');
  }

  /** False when the token survived: it is a live credential, so a caller must be able to say so. */
  async clear(): Promise<boolean> {
    return this.store.remove(SYNC_SESSION_KEY, 'local');
  }
}
