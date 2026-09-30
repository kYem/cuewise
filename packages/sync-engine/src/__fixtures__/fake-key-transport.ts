import type { KeyEnvelopeRecord, KeyValueStore, SyncRecord } from '@cuewise/shared';
import { ApiError } from '@cuewise/sync-client';
import {
  initOrEnrollKey,
  type KeyTransport,
  type ResolvedDataKey,
  setAsideDataKey,
} from '../key-lifecycle';

/**
 * In-memory KeyTransport fake with an ifAbsent-aware blob, for exercising initOrEnrollKey/checkForLostDataKey.
 * One instance is one account; two over the same key store are a device switching accounts.
 */
export class FakeKeyTransport implements KeyTransport {
  envelope: string | null = null;
  /** Simulates another device's PUT landing between this call's GET and its own ifAbsent PUT. */
  raceWinnerEnvelope: string | null = null;
  readonly putCalls: Array<{ envelope: string; ifAbsent?: boolean }> = [];

  /** The account's records, oldest first, as a pull from seq 0 would return them. */
  records: SyncRecord[] = [];

  constructor(readonly userId = 'user-a') {}

  async getAccount(): Promise<{ userId: string }> {
    return { userId: this.userId };
  }

  async getChanges(_since: number): Promise<{ records: SyncRecord[]; cursor: number }> {
    return { records: this.records, cursor: this.records.length };
  }

  async getRecoveryEnvelope(): Promise<KeyEnvelopeRecord | null> {
    if (this.envelope === null) {
      return null;
    }
    return { envelope: this.envelope, updatedAt: 0 };
  }

  async putRecoveryEnvelope(envelope: string, opts?: { ifAbsent?: boolean }): Promise<void> {
    this.putCalls.push({ envelope, ifAbsent: opts?.ifAbsent });
    if (opts?.ifAbsent === true) {
      if (this.raceWinnerEnvelope !== null) {
        // A concurrent device's create-only PUT landed first; the server keeps its blob.
        this.envelope = this.raceWinnerEnvelope;
        throw new ApiError('key_envelope_exists', 409);
      }
      if (this.envelope !== null) {
        throw new ApiError('key_envelope_exists', 409);
      }
    }
    this.envelope = envelope;
  }
}

/** A sign-in as enableSync performs it: the active key set aside, then the account's key resolved. */
export async function signIn(
  transport: FakeKeyTransport,
  keyStore: KeyValueStore,
  recoveryCode?: string
): Promise<ResolvedDataKey> {
  await setAsideDataKey(keyStore);
  return initOrEnrollKey({ transport, keyStore }, recoveryCode);
}
