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
/** Keys of accounts this device has switched away from, by userId, so switching back needs no code. */
export const SYNC_PARKED_DATA_KEYS = 'syncParkedDataKeys';

const INITIAL_KEY_ID = 'dk-1';

/** Structural subset of ApiClient — the recovery-envelope calls, and the account a key belongs to. */
export interface KeyTransport {
  getAccount(): Promise<{ userId: string }>;
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
 * checkForLostDataKey signal: the local data key is gone but the server still has a blob for this
 * account. The device can't recover the key itself (no MK/code persisted) — it must re-enroll.
 */
export class SelfHealNeedsEnrollError extends Error {
  constructor() {
    super('local data key missing but a server recovery envelope exists; re-enroll this device');
    this.name = 'SelfHealNeedsEnrollError';
  }
}

/**
 * `userId` is the account whose envelope this key came from. Keys persisted before ENG-128 have
 * none: only `bindLegacyDataKey` may add it, and nothing else ever reuses such a key.
 */
interface PersistedDataKey {
  keyId: string;
  dkB64: string;
  userId?: string;
}

type ParkedDataKeys = Record<string, { keyId: string; dkB64: string }>;

// btoa/atob round trip, kept as its own storage-only encoding, separate from @cuewise/crypto's
// frozen wire format: re-encoding this persisted blob would orphan already-stored keys.
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

/** Exported for the pairing path, which unwraps its key from a peer rather than from an envelope. */
export async function persistDataKey(
  keyStore: KeyValueStore,
  keyId: string,
  dk: DataKey,
  userId: string
): Promise<void> {
  await writeDataKey(keyStore, { keyId, dkB64: encodeDataKey(dk), userId });
}

async function writeDataKey(keyStore: KeyValueStore, persisted: PersistedDataKey): Promise<void> {
  const result = await keyStore.set<PersistedDataKey>(SYNC_DATA_KEY, persisted, 'local');
  if (!result.success) {
    throw new Error(`failed to persist sync data key: ${result.error.message}`);
  }
}

/** Reads back what `initOrEnrollKey` persisted, for callers (e.g. `start()`) that need the DK directly. */
export async function loadPersistedDataKey(
  keyStore: KeyValueStore
): Promise<{ dk: DataKey; keyId: string; userId?: string } | null> {
  const persisted = await keyStore.get<PersistedDataKey>(SYNC_DATA_KEY, 'local');
  if (persisted === null) {
    return null;
  }
  return { dk: decodeDataKey(persisted.dkB64), keyId: persisted.keyId, userId: persisted.userId };
}

/**
 * Binds a pre-ENG-128 key to `userId`. Only on an authenticated start, whose live session has been
 * syncing with this very key; never on a sign-in, which may have landed on a different account.
 */
export async function bindLegacyDataKey(keyStore: KeyValueStore, userId: string): Promise<void> {
  const persisted = await keyStore.get<PersistedDataKey>(SYNC_DATA_KEY, 'local');
  if (persisted === null || persisted.userId !== undefined) {
    return;
  }
  await writeDataKey(keyStore, { ...persisted, userId });
}

/**
 * Resolves this device's DataKey for the signed-in account: its own persisted or parked key if this
 * device holds one, else a brand-new account generates+uploads a key (code shown once), else an
 * existing envelope enrolls with the code. `resumed` means the key in use was already this account's.
 */
export async function initOrEnrollKey(
  deps: KeyLifecycleDeps,
  recoveryCode?: string
): Promise<{ dk: DataKey; keyId: string; recoveryCodeToShow?: string; resumed: boolean }> {
  // Set aside before asking whose session this is: should that fail, no key stays in use for an
  // account nobody checked. An unbound key cannot be parked, and is dropped with its account unknown.
  const active = await deps.keyStore.get<PersistedDataKey>(SYNC_DATA_KEY, 'local');
  if (active !== null) {
    if (active.userId !== undefined) {
      await parkDataKey(deps.keyStore, active.userId, active);
    }
    if (!(await deps.keyStore.remove(SYNC_DATA_KEY, 'local'))) {
      throw new Error('failed to set aside the sync data key before identifying the account');
    }
  }

  const { userId } = await deps.transport.getAccount();
  const parked = await readParkedDataKeys(deps.keyStore);
  const own = parked[userId];
  if (own !== undefined) {
    await writeDataKey(deps.keyStore, { ...own, userId });
    return {
      dk: decodeDataKey(own.dkB64),
      keyId: own.keyId,
      resumed: active !== null && active.userId === userId,
    };
  }

  const existing = await deps.transport.getRecoveryEnvelope();
  if (existing !== null) {
    const enrolled = await enrollFromEnvelope(deps, existing, recoveryCode, userId);
    return { ...enrolled, resumed: false };
  }
  const minted = await initNewKey(deps, recoveryCode, userId);
  return { ...minted, resumed: false };
}

async function readParkedDataKeys(keyStore: KeyValueStore): Promise<ParkedDataKeys> {
  return (await keyStore.get<ParkedDataKeys>(SYNC_PARKED_DATA_KEYS, 'local')) ?? {};
}

async function parkDataKey(
  keyStore: KeyValueStore,
  userId: string,
  persisted: PersistedDataKey
): Promise<void> {
  const parked = await readParkedDataKeys(keyStore);
  parked[userId] = { keyId: persisted.keyId, dkB64: persisted.dkB64 };
  const result = await keyStore.set(SYNC_PARKED_DATA_KEYS, parked, 'local');
  if (!result.success) {
    throw new Error(`failed to park sync data key: ${result.error.message}`);
  }
}

async function initNewKey(
  deps: KeyLifecycleDeps,
  recoveryCode: string | undefined,
  userId: string
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
      return enrollFromServer(deps, recoveryCode, userId);
    }
    throw err;
  }

  if (recoveryCode !== undefined) {
    // Only once the create-only PUT has won: on the race it loses to, the code is forwarded and
    // honoured. Here there was no envelope to unwrap, so a fresh key is minted instead.
    logger.error('Cloud sync ignored a recovery code: this account had no envelope to restore');
  }
  await persistDataKey(deps.keyStore, INITIAL_KEY_ID, dk, userId);
  return { dk, keyId: INITIAL_KEY_ID, recoveryCodeToShow: code };
}

async function enrollFromServer(
  deps: KeyLifecycleDeps,
  recoveryCode: string | undefined,
  userId: string
): Promise<{ dk: DataKey; keyId: string }> {
  const envelope = await deps.transport.getRecoveryEnvelope();
  if (envelope === null) {
    throw new Error('recovery envelope unexpectedly missing after a create-only PUT conflict');
  }
  return enrollFromEnvelope(deps, envelope, recoveryCode, userId);
}

async function enrollFromEnvelope(
  deps: KeyLifecycleDeps,
  envelope: KeyEnvelopeRecord,
  recoveryCode: string | undefined,
  userId: string
): Promise<{ dk: DataKey; keyId: string }> {
  if (recoveryCode === undefined || recoveryCode.trim() === '') {
    throw new RecoveryCodeRequiredError();
  }
  const secret = await parseRecoveryCode(recoveryCode);
  const mk = await deriveMasterKey(secret);
  const { dk, keyId } = await unwrapDataKey(mk, envelope.envelope);
  await persistDataKey(deps.keyStore, keyId, dk, userId);
  return { dk, keyId };
}

/**
 * Throws `SelfHealNeedsEnrollError` when this device's data key is gone but the server still holds
 * an envelope that the recovery code can unwrap. There is no repair to make here: this device
 * persists the DK, never the MK that wrapped it, so only a re-enroll can restore the key.
 *
 * The server is asked ONLY when the key is missing. With the DK on disk the device syncs whatever
 * the envelope says, and the one thing that reads it is the settings banner, which asks for itself
 * via `SyncEngine.refreshRecoveryEnvelope` — so a background check here would be a request per
 * worker spawn on behalf of a panel that is usually closed (ENG-98).
 */
export async function checkForLostDataKey(deps: KeyLifecycleDeps): Promise<void> {
  const persisted = await loadPersistedDataKey(deps.keyStore);
  if (persisted !== null) {
    return;
  }
  const envelope = await deps.transport.getRecoveryEnvelope();
  if (envelope !== null) {
    throw new SelfHealNeedsEnrollError();
  }
  // Neither present: sync was never enabled on this device, so there is nothing to recover.
}
