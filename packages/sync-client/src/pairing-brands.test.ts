import type {
  PairingCommitment,
  PairingNonceB64,
  PairingPublicKeyB64,
  PeerWrappedEnvelope,
} from '@cuewise/crypto';
import { describe, expect, it } from 'vitest';
import type { ApiClient } from './api-client';

// Compile-time guard: collapse a brand back to plain string and the directives below go unused,
// which fails `tsc`. Commitment, publicKey and nonce all clear the server's one length check.
describe('pairing wire brands', () => {
  it('keeps the four look-alike base64url values unassignable to each other', () => {
    function _guard(
      client: ApiClient,
      id: string,
      commitment: PairingCommitment,
      publicKey: PairingPublicKeyB64,
      nonce: PairingNonceB64,
      envelope: PeerWrappedEnvelope
    ): void {
      client.createPairing(commitment);
      client.commitPairing(id, publicKey);
      client.revealPairing(id, publicKey, nonce);
      client.putPairingEnvelope(id, envelope);
      // @ts-expect-error reveal's publicKey and nonce must not be interchangeable
      client.revealPairing(id, nonce, publicKey);
      // Argument 2 alone carries the swap above, so the nonce slot needs its own probe.
      // @ts-expect-error a public key must not satisfy the nonce parameter
      client.revealPairing(id, publicKey, publicKey);
      // @ts-expect-error a commitment must not satisfy a public-key parameter
      client.commitPairing(id, commitment);
      // @ts-expect-error an envelope must not satisfy a commitment parameter
      client.createPairing(envelope);
      // @ts-expect-error a bare string must not satisfy any of them
      client.putPairingEnvelope(id, 'v1.dk-1.a.b');
    }
    expect(typeof _guard).toBe('function');
  });
});
