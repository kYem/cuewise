import type {
  PairingCommitment,
  PairingNonceB64,
  PairingPublicKeyB64,
  PeerWrappedEnvelope,
} from '@cuewise/crypto';
import { describe, expect, it } from 'vitest';
import type { ApiClient } from './api-client';

// Compile-time guard: if the pairing wire brands collapsed back to plain string, the directives
// below would go unused and `tsc` would fail the build. All four clear the server's length checks,
// so only the compiler can tell them apart.
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
      void client.createPairing(commitment);
      void client.commitPairing(id, publicKey);
      void client.revealPairing(id, publicKey, nonce);
      void client.putPairingEnvelope(id, envelope);
      // @ts-expect-error reveal's publicKey and nonce must not be interchangeable
      void client.revealPairing(id, nonce, publicKey);
      // @ts-expect-error a commitment must not satisfy a public-key parameter
      void client.commitPairing(id, commitment);
      // @ts-expect-error an envelope must not satisfy a commitment parameter
      void client.createPairing(envelope);
      // @ts-expect-error a bare string must not satisfy any of them
      void client.putPairingEnvelope(id, 'v1.dk-1.a.b');
    }
    expect(typeof _guard).toBe('function');
  });
});
