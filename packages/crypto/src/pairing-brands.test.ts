import { describe, expect, it } from 'vitest';
import {
  encodePairingNonce,
  encodePairingPublicKey,
  makePairingCommitment,
  type PairingNonce,
  type PairingPublicKey,
  verifyPairingCommitment,
} from './pairing';

// Compile-time guard: collapse a brand back to plain Uint8Array/string and the directives below go
// unused, which fails `tsc`. A public key and a nonce are the pair nothing else can tell apart.
describe('pairing key material brands', () => {
  it('keeps a public key and a nonce unassignable to each other', () => {
    function _guard(pub: PairingPublicKey, nonce: PairingNonce): void {
      encodePairingPublicKey(pub);
      encodePairingNonce(nonce);
      // @ts-expect-error a nonce must not satisfy a public-key parameter
      encodePairingPublicKey(nonce);
      // @ts-expect-error a public key must not satisfy a nonce parameter
      encodePairingNonce(pub);
      // @ts-expect-error raw bytes must not satisfy a branded public-key parameter
      encodePairingPublicKey(new Uint8Array(32));
    }
    expect(typeof _guard).toBe('function');
  });

  it('keeps the commitment inputs in their declared order', async () => {
    async function _guard(pub: PairingPublicKey, nonce: PairingNonce): Promise<void> {
      const { commitment } = await makePairingCommitment(pub);
      verifyPairingCommitment(commitment, pub, nonce);
      // @ts-expect-error the pub and nonce arguments must not be interchangeable
      verifyPairingCommitment(commitment, nonce, pub);
      // @ts-expect-error a bare string must not satisfy a PairingCommitment parameter
      verifyPairingCommitment('not-a-commitment', pub, nonce);
    }
    expect(typeof _guard).toBe('function');
  });
});
