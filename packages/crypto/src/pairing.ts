import { b64urlDecode, b64urlEncode } from './base64url';
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
  x25519SharedSecret,
} from './primitives';

const WRAP_INFO = 'cuewise-pairing-wrap-v1';
const SAS_INFO = 'cuewise-pairing-sas-v1';

/** Byte length of a raw X25519 public key — every pairing key, on both sides. */
export const PAIRING_PUBLIC_KEY_BYTES = 32;

// A public key and a nonce are both 32 opaque bytes revealed together, so only the compiler can
// keep them apart: unbranded, `encodePairingPublicKey(nonce)` returns a correctly-branded string.
export type PairingPublicKey = Uint8Array & { readonly __brand: 'PairingPublicKey' };
export type PairingNonce = Uint8Array & { readonly __brand: 'PairingNonce' };

/** The keypair one device brings to a pairing; the private key is non-extractable. */
export interface PairingKeyPair {
  publicKey: PairingPublicKey;
  privateKey: CryptoKey;
}

// The wire forms. Positional identity only: a brand says which role a value plays, never that it is
// valid base64url, so every decode of one stays guarded. Same pattern as DataKey/MasterKey.
export type PairingCommitment = string & { readonly __brand: 'PairingCommitment' };
export type PairingPublicKeyB64 = string & { readonly __brand: 'PairingPublicKeyB64' };
export type PairingNonceB64 = string & { readonly __brand: 'PairingNonceB64' };
export type PeerWrappedEnvelope = string & { readonly __brand: 'PeerWrappedEnvelope' };

export function encodePairingPublicKey(pub: PairingPublicKey): PairingPublicKeyB64 {
  return b64urlEncode(pub) as PairingPublicKeyB64;
}

export function encodePairingNonce(nonce: PairingNonce): PairingNonceB64 {
  return b64urlEncode(nonce) as PairingNonceB64;
}

/** A peer's public key from the wire. The length is load-bearing — see decodePairingNonce. */
export function decodePairingPublicKey(b64: string): PairingPublicKey {
  const bytes = b64urlDecode(b64);
  if (bytes.length !== PAIRING_PUBLIC_KEY_BYTES) {
    throw new EnvelopeParseError('invalid pairing public key length');
  }
  return bytes as PairingPublicKey;
}

// No length check: the commitment is the check. What must not move is the 32 bytes above — it is
// the fixed split that keeps the unframed `pub‖nonce` transcript unambiguous.
export function decodePairingNonce(b64: string): PairingNonce {
  return b64urlDecode(b64) as PairingNonce;
}

export async function generatePairingKeypair(): Promise<PairingKeyPair> {
  const pair = await generateX25519KeyPair();
  return { publicKey: pair.publicKey as PairingPublicKey, privateKey: pair.privateKey };
}

function pairingAad(pairingId: string, keyId: string): Uint8Array {
  return utf8(`v1|pairing|${pairingId}|${keyId}`);
}

// Requester key first on both sides, so the two screens hash the same transcript.
export async function derivePairingSas(
  requesterPub: PairingPublicKey,
  approverPub: PairingPublicKey,
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

async function pairingWrapKey(priv: CryptoKey, peerPub: PairingPublicKey): Promise<Uint8Array> {
  return hkdfSha256(await x25519SharedSecret(priv, peerPub), WRAP_INFO, 256);
}

export async function wrapDataKeyToPeer(
  priv: CryptoKey,
  peerPub: PairingPublicKey,
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
  peerPub: PairingPublicKey,
  envelope: PeerWrappedEnvelope,
  pairingId: string
): Promise<{ dk: DataKey; keyId: string }> {
  const { keyId, iv, ct } = splitEnvelope(envelope);
  const key = await pairingWrapKey(priv, peerPub);
  const dk = await aesGcmOpen(key, iv, ct, pairingAad(pairingId, keyId));
  return { dk: dk as DataKey, keyId };
}

export async function makePairingCommitment(
  pub: PairingPublicKey
): Promise<{ commitment: PairingCommitment; nonce: PairingNonce }> {
  const nonce = randomBytes(32) as PairingNonce;
  const transcript = new Uint8Array(pub.length + nonce.length);
  transcript.set(pub, 0);
  transcript.set(nonce, pub.length);
  const hash = await sha256(transcript);
  const commitment = b64urlEncode(hash) as PairingCommitment;
  return { commitment, nonce };
}

export async function verifyPairingCommitment(
  commitment: PairingCommitment,
  pub: PairingPublicKey,
  nonce: PairingNonce
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
