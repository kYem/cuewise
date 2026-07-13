import type { KeyEnvelopeRecord } from '@cuewise/shared';
import { ApiError } from '@cuewise/sync-client';
import type { KeyTransport } from '../key-lifecycle';

/** In-memory KeyTransport fake with an ifAbsent-aware blob, for exercising initOrEnrollKey/selfHealKeyBlob. */
export class FakeKeyTransport implements KeyTransport {
  envelope: string | null = null;
  /** Simulates another device's PUT landing between this call's GET and its own ifAbsent PUT. */
  raceWinnerEnvelope: string | null = null;
  readonly putCalls: Array<{ envelope: string; ifAbsent?: boolean }> = [];

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
