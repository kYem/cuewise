import { b64urlEncode } from './base64url';
import { EnvelopeParseError } from './errors';
import type { DataKey } from './keys';
import {
  aesGcmOpen,
  aesGcmSeal,
  generateX25519KeyPair,
  hkdfSha256,
  isValidKeyId,
  randomBytes,
  sha256,
  splitEnvelope,
  utf8,
  type X25519KeyPair,
  x25519SharedSecret,
} from './primitives';

const WRAP_INFO = 'cuewise-pairing-wrap-v1';
const SAS_INFO = 'cuewise-pairing-sas-v1';

export type { X25519KeyPair };

// The four pairing wire strings are look-alike base64url carried positionally through
// createPairing/commitPairing/revealPairing/putPairingEnvelope. Branded so a swap cannot compile:
// it would otherwise pass the server's length checks and surface as a key substitution the user is
// told about. Same pattern as DataKey/MasterKey in keys.ts.
export type PairingCommitment = string & { readonly __brand: 'PairingCommitment' };
export type PairingPublicKeyB64 = string & { readonly __brand: 'PairingPublicKeyB64' };
export type PairingNonceB64 = string & { readonly __brand: 'PairingNonceB64' };
export type PeerWrappedEnvelope = string & { readonly __brand: 'PeerWrappedEnvelope' };

// The only supported way to put either key-material value on the wire, so the brand is applied
// where the bytes are encoded rather than at a call site that could brand the wrong one.
export function encodePairingPublicKey(pub: Uint8Array): PairingPublicKeyB64 {
  return b64urlEncode(pub) as PairingPublicKeyB64;
}

export function encodePairingNonce(nonce: Uint8Array): PairingNonceB64 {
  return b64urlEncode(nonce) as PairingNonceB64;
}

export function generatePairingKeypair(): Promise<X25519KeyPair> {
  return generateX25519KeyPair();
}

function pairingAad(pairingId: string, keyId: string): Uint8Array {
  return utf8(`v1|pairing|${pairingId}|${keyId}`);
}

// Requester key first on both sides, so the two screens hash the same transcript.
export async function derivePairingSas(
  requesterPub: Uint8Array,
  approverPub: Uint8Array,
  pairingId: string
): Promise<string> {
  const id = utf8(pairingId);
  const transcript = new Uint8Array(requesterPub.length + approverPub.length + id.length);
  transcript.set(requesterPub, 0);
  transcript.set(approverPub, requesterPub.length);
  transcript.set(id, requesterPub.length + approverPub.length);
  const bits = await hkdfSha256(await sha256(transcript), SAS_INFO, 32);
  const n = new DataView(bits.buffer, bits.byteOffset, 4).getUint32(0) % 1_000_000;
  return String(n).padStart(6, '0');
}

async function pairingWrapKey(priv: CryptoKey, peerPub: Uint8Array): Promise<Uint8Array> {
  return hkdfSha256(await x25519SharedSecret(priv, peerPub), WRAP_INFO, 256);
}

export async function wrapDataKeyToPeer(
  priv: CryptoKey,
  peerPub: Uint8Array,
  dk: DataKey,
  keyId: string,
  pairingId: string
): Promise<PeerWrappedEnvelope> {
  if (!isValidKeyId(keyId)) {
    throw new EnvelopeParseError('invalid keyId');
  }
  const key = await pairingWrapKey(priv, peerPub);
  const iv = randomBytes(12);
  const ct = await aesGcmSeal(key, iv, dk, pairingAad(pairingId, keyId));
  return `v1.${keyId}.${b64urlEncode(iv)}.${b64urlEncode(ct)}` as PeerWrappedEnvelope;
}

export async function unwrapDataKeyFromPeer(
  priv: CryptoKey,
  peerPub: Uint8Array,
  envelope: PeerWrappedEnvelope,
  pairingId: string
): Promise<{ dk: DataKey; keyId: string }> {
  const { keyId, iv, ct } = splitEnvelope(envelope);
  const key = await pairingWrapKey(priv, peerPub);
  const dk = await aesGcmOpen(key, iv, ct, pairingAad(pairingId, keyId));
  return { dk: dk as DataKey, keyId };
}

export async function makePairingCommitment(
  pub: Uint8Array
): Promise<{ commitment: PairingCommitment; nonce: Uint8Array }> {
  const nonce = randomBytes(32);
  const transcript = new Uint8Array(pub.length + nonce.length);
  transcript.set(pub, 0);
  transcript.set(nonce, pub.length);
  const hash = await sha256(transcript);
  const commitment = b64urlEncode(hash) as PairingCommitment;
  return { commitment, nonce };
}

export async function verifyPairingCommitment(
  commitment: PairingCommitment,
  pub: Uint8Array,
  nonce: Uint8Array
): Promise<boolean> {
  const transcript = new Uint8Array(pub.length + nonce.length);
  transcript.set(pub, 0);
  transcript.set(nonce, pub.length);
  const hash = await sha256(transcript);
  const expectedCommitment = b64urlEncode(hash);
  if (commitment === expectedCommitment) {
    return true;
  }
  return false;
}
