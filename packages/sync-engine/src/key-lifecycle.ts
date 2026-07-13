import {
  type DataKey,
  deriveMasterKey,
  generateDataKey,
  generateRecoveryCode,
  parseRecoveryCode,
  unwrapDataKey,
  wrapDataKey,
} from '@cuewise/crypto';
import { type KeyEnvelopeRecord, type KeyValueStore, logger } from '@cuewise/shared';
import { ApiError } from '@cuewise/sync-client';

export const SYNC_DATA_KEY = 'syncDataKey';

const INITIAL_KEY_ID = 'dk-1';

/** Structural subset of ApiClient — key-lifecycle only needs the recovery-envelope calls. */
export interface KeyTransport {
  getRecoveryEnvelope(): Promise<KeyEnvelopeRecord | null>;
  putRecoveryEnvelope(envelope: string, opts?: { ifAbsent?: boolean }): Promise<void>;
}

export interface KeyLifecycleDeps {
  transport: KeyTransport;
  keyStore: KeyValueStore;
}

export class RecoveryCodeRequiredError extends Error {
  constructor() {
    super('a recovery code is required to enroll this device');
    this.name = 'RecoveryCodeRequiredError';
  }
}

/**
 * selfHealKeyBlob signal: the local data key is gone but the server still has a blob for this
 * account. The device can't recover the key itself (no MK/code persisted) — it must re-enroll.
 */
export class SelfHealNeedsEnrollError extends Error {
  constructor() {
    super('local data key missing but a server recovery envelope exists; re-enroll this device');
    this.name = 'SelfHealNeedsEnrollError';
  }
}

/**
 * selfHealKeyBlob signal: the local data key exists but the server has no envelope. Unrecoverable
 * without the recovery code — this device never persists the master key that wrapped it.
 */
export class SelfHealUnrecoverableError extends Error {
  constructor() {
    super(
      'local data key present but the server recovery envelope is missing; ' +
        're-enable sync with the recovery code to restore it'
    );
    this.name = 'SelfHealUnrecoverableError';
  }
}

interface PersistedDataKey {
  keyId: string;
  dkB64: string;
}

// btoa/atob round trip. @cuewise/crypto's own b64url helper is deliberately private to that
// package, so this is a distinct, storage-only encoding with no URL-safety requirement.
function encodeDataKey(dk: DataKey): string {
  let binary = '';
  for (const byte of dk) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeDataKey(b64: string): DataKey {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes as DataKey;
}

async function persistDataKey(keyStore: KeyValueStore, keyId: string, dk: DataKey): Promise<void> {
  const result = await keyStore.set<PersistedDataKey>(
    SYNC_DATA_KEY,
    { keyId, dkB64: encodeDataKey(dk) },
    'local'
  );
  if (!result.success) {
    throw new Error(`failed to persist sync data key: ${result.error.message}`);
  }
}

async function loadPersistedDataKey(
  keyStore: KeyValueStore
): Promise<{ dk: DataKey; keyId: string } | null> {
  const persisted = await keyStore.get<PersistedDataKey>(SYNC_DATA_KEY, 'local');
  if (persisted === null) {
    return null;
  }
  return { dk: decodeDataKey(persisted.dkB64), keyId: persisted.keyId };
}

/**
 * Resolves this device's DataKey. A brand-new account generates+uploads a key (code shown once);
 * a device that finds an existing envelope must enroll with the code — this serializes first-enable.
 */
export async function initOrEnrollKey(
  deps: KeyLifecycleDeps,
  recoveryCode?: string
): Promise<{ dk: DataKey; keyId: string; recoveryCodeToShow?: string }> {
  const existing = await deps.transport.getRecoveryEnvelope();
  if (existing !== null) {
    return enrollFromEnvelope(deps, existing, recoveryCode);
  }
  return initNewKey(deps, recoveryCode);
}

async function initNewKey(
  deps: KeyLifecycleDeps,
  recoveryCode: string | undefined
): Promise<{ dk: DataKey; keyId: string; recoveryCodeToShow?: string }> {
  const dk = generateDataKey();
  const { code, secret } = await generateRecoveryCode();
  const mk = await deriveMasterKey(secret);
  const blob = await wrapDataKey(mk, dk, INITIAL_KEY_ID);

  try {
    await deps.transport.putRecoveryEnvelope(blob, { ifAbsent: true });
  } catch (err) {
    if (err instanceof ApiError && err.code === 'key_envelope_exists') {
      // Lost the race to another device initializing the same account's key — enroll instead.
      return enrollFromServer(deps, recoveryCode);
    }
    throw err;
  }

  await persistDataKey(deps.keyStore, INITIAL_KEY_ID, dk);
  return { dk, keyId: INITIAL_KEY_ID, recoveryCodeToShow: code };
}

async function enrollFromServer(
  deps: KeyLifecycleDeps,
  recoveryCode: string | undefined
): Promise<{ dk: DataKey; keyId: string }> {
  const envelope = await deps.transport.getRecoveryEnvelope();
  if (envelope === null) {
    throw new Error('recovery envelope unexpectedly missing after a create-only PUT conflict');
  }
  return enrollFromEnvelope(deps, envelope, recoveryCode);
}

async function enrollFromEnvelope(
  deps: KeyLifecycleDeps,
  envelope: KeyEnvelopeRecord,
  recoveryCode: string | undefined
): Promise<{ dk: DataKey; keyId: string }> {
  if (recoveryCode === undefined || recoveryCode.trim() === '') {
    throw new RecoveryCodeRequiredError();
  }
  const secret = await parseRecoveryCode(recoveryCode);
  const mk = await deriveMasterKey(secret);
  const { dk, keyId } = await unwrapDataKey(mk, envelope.envelope);
  await persistDataKey(deps.keyStore, keyId, dk);
  return { dk, keyId };
}

/**
 * Corrected from the design doc's "re-wrap and re-upload a missing blob": this device only
 * persists the DK, never the MK, so it cannot re-wrap anything itself. Four cases:
 *  - DK + envelope both present → healthy, no-op.
 *  - DK missing, envelope present → this device lost its key; can't self-recover, so it throws
 *    a typed signal telling the caller to re-enroll with the recovery code (never a silent no-op).
 *  - DK present, envelope missing → unrecoverable without the recovery code (the MK that wrapped
 *    this DK was never persisted); warns (metadata only) and throws a typed signal.
 *  - neither present → sync was never enabled here; nothing to heal.
 */
export async function selfHealKeyBlob(deps: KeyLifecycleDeps): Promise<void> {
  const persisted = await loadPersistedDataKey(deps.keyStore);
  const envelope = await deps.transport.getRecoveryEnvelope();

  if (persisted !== null && envelope !== null) {
    return;
  }
  if (persisted === null && envelope !== null) {
    throw new SelfHealNeedsEnrollError();
  }
  if (persisted !== null && envelope === null) {
    logger.warn(
      'Local data key present but server recovery envelope missing; cannot self-heal without the recovery code',
      { keyId: persisted.keyId }
    );
    throw new SelfHealUnrecoverableError();
  }
}
