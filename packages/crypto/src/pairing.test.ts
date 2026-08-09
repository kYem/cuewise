import { describe, expect, it } from 'vitest';
import { DecryptError } from './errors';
import { generateDataKey } from './keys';
import {
  derivePairingSas,
  generatePairingKeypair,
  makePairingCommitment,
  unwrapDataKeyFromPeer,
  verifyPairingCommitment,
  wrapDataKeyToPeer,
} from './pairing';

describe('derivePairingSas', () => {
  it('both sides derive the same six digits', async () => {
    const requester = await generatePairingKeypair();
    const approver = await generatePairingKeypair();

    const onRequester = await derivePairingSas(requester.publicKey, approver.publicKey, 'p-1');
    const onApprover = await derivePairingSas(requester.publicKey, approver.publicKey, 'p-1');

    expect(onRequester).toBe(onApprover);
    expect(onRequester).toMatch(/^\d{6}$/);
  });

  it('changes when either public key is substituted — the MITM property', async () => {
    const requester = await generatePairingKeypair();
    const approver = await generatePairingKeypair();
    const attacker = await generatePairingKeypair();

    const honest = await derivePairingSas(requester.publicKey, approver.publicKey, 'p-1');
    const substitutedRequester = await derivePairingSas(
      attacker.publicKey,
      approver.publicKey,
      'p-1'
    );
    const substitutedApprover = await derivePairingSas(
      requester.publicKey,
      attacker.publicKey,
      'p-1'
    );

    expect(substitutedRequester).not.toBe(honest);
    expect(substitutedApprover).not.toBe(honest);
  });

  it('changes with the pairing id', async () => {
    const requester = await generatePairingKeypair();
    const approver = await generatePairingKeypair();

    const one = await derivePairingSas(requester.publicKey, approver.publicKey, 'p-1');
    const two = await derivePairingSas(requester.publicKey, approver.publicKey, 'p-2');

    expect(one).not.toBe(two);
  });
});

describe('wrapDataKeyToPeer / unwrapDataKeyFromPeer', () => {
  it('round-trips the data key and its keyId between two peers', async () => {
    const requester = await generatePairingKeypair();
    const approver = await generatePairingKeypair();
    const dk = generateDataKey();

    const envelope = await wrapDataKeyToPeer(
      approver.privateKey,
      requester.publicKey,
      dk,
      'dk-1',
      'p-1'
    );
    const opened = await unwrapDataKeyFromPeer(
      requester.privateKey,
      approver.publicKey,
      envelope,
      'p-1'
    );

    expect(opened.dk).toEqual(dk);
    expect(opened.keyId).toBe('dk-1');
  });

  it('refuses an envelope wrapped for a different pairing id', async () => {
    const requester = await generatePairingKeypair();
    const approver = await generatePairingKeypair();
    const dk = generateDataKey();

    const envelope = await wrapDataKeyToPeer(
      approver.privateKey,
      requester.publicKey,
      dk,
      'dk-1',
      'p-1'
    );

    await expect(
      unwrapDataKeyFromPeer(requester.privateKey, approver.publicKey, envelope, 'p-other')
    ).rejects.toThrow(DecryptError);
  });

  it('refuses an envelope opened with the wrong private key', async () => {
    const requester = await generatePairingKeypair();
    const approver = await generatePairingKeypair();
    const eavesdropper = await generatePairingKeypair();
    const dk = generateDataKey();

    const envelope = await wrapDataKeyToPeer(
      approver.privateKey,
      requester.publicKey,
      dk,
      'dk-1',
      'p-1'
    );

    await expect(
      unwrapDataKeyFromPeer(eavesdropper.privateKey, approver.publicKey, envelope, 'p-1')
    ).rejects.toThrow(DecryptError);
  });
});

describe('makePairingCommitment / verifyPairingCommitment', () => {
  it('round-trip verifies to true', async () => {
    const requester = await generatePairingKeypair();
    const { commitment, nonce } = await makePairingCommitment(requester.publicKey);

    const verified = await verifyPairingCommitment(commitment, requester.publicKey, nonce);

    expect(verified).toBe(true);
  });

  it('wrong public key fails verification', async () => {
    const requester = await generatePairingKeypair();
    const other = await generatePairingKeypair();
    const { commitment, nonce } = await makePairingCommitment(requester.publicKey);

    const verified = await verifyPairingCommitment(commitment, other.publicKey, nonce);

    expect(verified).toBe(false);
  });

  it('wrong nonce fails verification', async () => {
    const requester = await generatePairingKeypair();
    const { commitment } = await makePairingCommitment(requester.publicKey);
    const wrongNonce = new Uint8Array(32);

    const verified = await verifyPairingCommitment(commitment, requester.publicKey, wrongNonce);

    expect(verified).toBe(false);
  });

  it('two commitments for same public key differ (fresh nonces)', async () => {
    const requester = await generatePairingKeypair();
    const { commitment: commitment1 } = await makePairingCommitment(requester.publicKey);
    const { commitment: commitment2 } = await makePairingCommitment(requester.publicKey);

    expect(commitment1).not.toBe(commitment2);
  });
});
