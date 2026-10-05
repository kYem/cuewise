import {
  type DataKey,
  DecryptError,
  deriveMasterKey,
  EnvelopeParseError,
  generateDataKey,
  generateRecoveryCode,
  openRecord,
  parseRecoveryCode,
  unwrapDataKey,
  wrapDataKey,
} from '@cuewise/crypto';
import {
  type KeyEnvelopeRecord,
  type KeyValueStore,
  logger,
  type SyncRecord,
} from '@cuewise/shared';
import { ApiError, StorageReadError } from '@cuewise/sync-client';

export const SYNC_DATA_KEY = 'syncDataKey';
/** Every account key this device has set aside, by userId, so returning to one needs no code. */
export const SYNC_PARKED_DATA_KEYS = 'syncParkedDataKeys';
/** A key stored before keys recorded their account: kept, but reused only once a record proves it. */
export const SYNC_UNBOUND_DATA_KEY = 'syncUnboundDataKey';

const INITIAL_KEY_ID = 'dk-1';

/** Structural subset of ApiClient: the envelope calls, whose account this is, and its records. */
export interface KeyTransport {
  getAccount(): Promise<{ userId: string }>;
  getRecoveryEnvelope(): Promise<KeyEnvelopeRecord | null>;
  putRecoveryEnvelope(envelope: string, opts?: { ifAbsent?: boolean }): Promise<void>;
  getChanges(since: number): Promise<{ records: SyncRecord[]; cursor: number }>;
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
 * checkForLostDataKey signal: this device holds no key for the signed-in account, whose server has an
 * envelope. The device can't recover the key itself (no MK/code persisted) — it must re-enroll.
 */
export class SelfHealNeedsEnrollError extends Error {
  constructor() {
    super('local data key missing but a server recovery envelope exists; re-enroll this device');
    this.name = 'SelfHealNeedsEnrollError';
  }
}

/** `enabled`: an enable into this key's account finished on this device, so its ledger is complete. */
interface StoredKey {
  keyId: string;
  dkB64: string;
  enabled?: boolean;
}

/** `userId` is unset only on keys stored before keys recorded their account. */
interface PersistedDataKey extends StoredKey {
  userId?: string;
}

type ParkedDataKeys = Record<string, StoredKey>;

export interface ResolvedDataKey {
  dk: DataKey;
  keyId: string;
  userId: string;
  recoveryCodeToShow?: string;
  /** An enable into this account finished on this device at some point. */
  enableCompleted: boolean;
}

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

/**
 * Reads one key-material slot, refusing rather than answering "absent" when it cannot: every
 * caller would otherwise overwrite or mint over a key that is on disk.
 */
async function readSlot<T>(keyStore: KeyValueStore, key: string): Promise<T | null> {
  const stored = await keyStore.getMany([key], 'local');
  if (stored === null) {
    throw new StorageReadError(key);
  }
  const entry = stored[key];
  if (entry === undefined) {
    return null;
  }
  if (!entry.readable) {
    throw new Error(`${key} is stored but unreadable`);
  }
  return entry.value as T;
}

/**
 * A parked or unbound slot that is stored but unreadable is logged and dropped: refusing would
 * block every sign-in, and nothing can read it back. A failed read still throws.
 */
async function readSetAsideSlot<T>(keyStore: KeyValueStore, key: string): Promise<T | null> {
  const stored = await keyStore.getMany([key], 'local');
  if (stored === null) {
    throw new StorageReadError(key);
  }
  const entry = stored[key];
  if (entry === undefined || entry.readable) {
    return (entry?.value ?? null) as T | null;
  }
  logger.error(`Cloud sync dropped ${key}: it is stored but unreadable`);
  if (!(await keyStore.remove(key, 'local'))) {
    throw new Error(`${key} is unreadable and could not be removed`);
  }
  return null;
}

async function writeSlot(keyStore: KeyValueStore, key: string, value: unknown): Promise<void> {
  const result = await keyStore.set(key, value, 'local');
  if (!result.success) {
    throw new Error(`failed to write ${key}: ${result.error.message}`);
  }
}

/** Exported for the pairing path, which unwraps its key from a peer rather than from an envelope. */
export async function persistDataKey(
  keyStore: KeyValueStore,
  keyId: string,
  dk: DataKey,
  userId: string
): Promise<void> {
  await writeSlot(keyStore, SYNC_DATA_KEY, { keyId, dkB64: encodeDataKey(dk), userId });
}

/**
 * Reads back what `initOrEnrollKey` persisted, for callers (e.g. `start()`) that need the DK
 * directly. Null only when no key is stored; a failed read throws `StorageReadError`.
 */
export async function loadPersistedDataKey(
  keyStore: KeyValueStore
): Promise<{ dk: DataKey; keyId: string; userId?: string } | null> {
  const persisted = await readSlot<PersistedDataKey>(keyStore, SYNC_DATA_KEY);
  if (persisted === null) {
    return null;
  }
  return { dk: decodeDataKey(persisted.dkB64), keyId: persisted.keyId, userId: persisted.userId };
}

/**
 * Binds an unbound key to `userId`. Only on an authenticated start, whose live session has been
 * syncing with this very key; never on a sign-in, which may have landed on a different account.
 */
export async function bindLegacyDataKey(keyStore: KeyValueStore, userId: string): Promise<void> {
  const persisted = await readSlot<PersistedDataKey>(keyStore, SYNC_DATA_KEY);
  if (persisted === null || persisted.userId !== undefined) {
    return;
  }
  await writeSlot(keyStore, SYNC_DATA_KEY, { ...persisted, userId });
}

/** Records that the enable into the active key's account finished on this device. */
export async function markEnableCompleted(keyStore: KeyValueStore): Promise<void> {
  const persisted = await readSlot<PersistedDataKey>(keyStore, SYNC_DATA_KEY);
  if (persisted === null || persisted.enabled === true) {
    return;
  }
  await writeSlot(keyStore, SYNC_DATA_KEY, { ...persisted, enabled: true });
}

/** What a set-aside took out of use; `userId` is unset for a key that recorded no account. */
export interface SetAsideKey {
  userId?: string;
}

/**
 * Takes the active key out of use before a new session is saved beside it, parking a bound key
 * under its account and an unbound one in its own slot. Answers null when there was none.
 */
export async function setAsideDataKey(keyStore: KeyValueStore): Promise<SetAsideKey | null> {
  const active = await readSlot<PersistedDataKey>(keyStore, SYNC_DATA_KEY);
  if (active === null) {
    return null;
  }
  const { userId, ...key } = active;
  if (userId === undefined) {
    logger.warn('Cloud sync set aside a data key with no account; a pulled record must prove it');
    await writeSlot(keyStore, SYNC_UNBOUND_DATA_KEY, key);
  } else {
    const parked = (await readSetAsideSlot<ParkedDataKeys>(keyStore, SYNC_PARKED_DATA_KEYS)) ?? {};
    parked[userId] = key;
    await writeSlot(keyStore, SYNC_PARKED_DATA_KEYS, parked);
  }
  if (!(await keyStore.remove(SYNC_DATA_KEY, 'local'))) {
    throw new Error('failed to set aside the sync data key');
  }
  return { userId };
}

/**
 * Resolves the DataKey for the signed-in account: a key this device already holds for it, else a
 * brand-new account generates+uploads a key (code shown once), else its envelope enrolls with the code.
 */
export async function initOrEnrollKey(
  deps: KeyLifecycleDeps,
  recoveryCode?: string
): Promise<ResolvedDataKey> {
  const { userId } = await deps.transport.getAccount();
  const held = await restoreHeldKey(deps, userId);
  if (held !== null) {
    return held;
  }

  const existing = await deps.transport.getRecoveryEnvelope();
  if (existing !== null) {
    const enrolled = await enrollFromEnvelope(deps, existing, recoveryCode, userId);
    return { ...enrolled, userId, enableCompleted: false };
  }
  const minted = await initNewKey(deps, recoveryCode, userId);
  return { ...minted, userId, enableCompleted: false };
}

/** Makes this account's own held key the active one, if this device has it. */
async function restoreHeldKey(
  deps: KeyLifecycleDeps,
  userId: string
): Promise<ResolvedDataKey | null> {
  const active = await readSlot<PersistedDataKey>(deps.keyStore, SYNC_DATA_KEY);
  if (active !== null && active.userId === userId) {
    return resolved(active, userId);
  }
  // Only enableSync sets aside before calling; a foreign active key must not be overwritten.
  await setAsideDataKey(deps.keyStore);

  const parked =
    (await readSetAsideSlot<ParkedDataKeys>(deps.keyStore, SYNC_PARKED_DATA_KEYS)) ?? {};
  const own = parked[userId];
  if (own !== undefined) {
    // Without `enabled`: the ledger is not this account's until this activation finishes again.
    await writeSlot(deps.keyStore, SYNC_DATA_KEY, { keyId: own.keyId, dkB64: own.dkB64, userId });
    return resolved(own, userId);
  }

  const unbound = await readSetAsideSlot<StoredKey>(deps.keyStore, SYNC_UNBOUND_DATA_KEY);
  if (unbound !== null && (await opensAccountRecords(deps.transport, unbound))) {
    const proven = { keyId: unbound.keyId, dkB64: unbound.dkB64 };
    await writeSlot(deps.keyStore, SYNC_DATA_KEY, { ...proven, userId });
    if (!(await deps.keyStore.remove(SYNC_UNBOUND_DATA_KEY, 'local'))) {
      logger.warn(
        `Cloud sync bound its unbound data key but could not clear ${SYNC_UNBOUND_DATA_KEY}`
      );
    }
    return resolved(proven, userId);
  }
  return null;
}

function resolved(key: StoredKey, userId: string): ResolvedDataKey {
  return {
    dk: decodeDataKey(key.dkB64),
    keyId: key.keyId,
    userId,
    enableCompleted: key.enabled === true,
  };
}

/** Proof an unbound key is this account's: it opens every record on the account's first page. */
async function opensAccountRecords(transport: KeyTransport, key: StoredKey): Promise<boolean> {
  const { records } = await transport.getChanges(0);
  if (records.length === 0) {
    return false;
  }
  const dk = decodeDataKey(key.dkB64);
  for (const rec of records) {
    try {
      await openRecord(dk, rec.ciphertext, rec.collection, rec.entityId);
    } catch (err) {
      if (err instanceof DecryptError || err instanceof EnvelopeParseError) {
        return false;
      }
      throw err;
    }
  }
  return true;
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
 * `restored`: a set-aside key is active again, beside a ledger that may track another account.
 * `unkeyed`: the device holds only other accounts' keys, and this one has no envelope yet.
 */
export type LostKeyCheck = 'present' | 'restored' | 'unkeyed' | 'none';

/**
 * Restores a held key for the signed-in account; else throws `SelfHealNeedsEnrollError` when the
 * server has an envelope the recovery code can unwrap.
 *
 * The server is asked ONLY when the key is missing. With the DK on disk the device syncs whatever
 * the envelope says, and the one thing that reads it is the settings banner, which asks for itself
 * via `SyncEngine.refreshRecoveryEnvelope` — so a background check here would be a request per
 * worker spawn on behalf of a panel that is usually closed (ENG-98).
 */
export async function checkForLostDataKey(deps: KeyLifecycleDeps): Promise<LostKeyCheck> {
  const persisted = await loadPersistedDataKey(deps.keyStore);
  if (persisted !== null) {
    return 'present';
  }
  const holdsKeys = await holdsSetAsideKeys(deps.keyStore);
  if (holdsKeys) {
    const { userId } = await deps.transport.getAccount();
    if ((await restoreHeldKey(deps, userId)) !== null) {
      return 'restored';
    }
  }
  const envelope = await deps.transport.getRecoveryEnvelope();
  if (envelope !== null) {
    throw new SelfHealNeedsEnrollError();
  }
  return holdsKeys ? 'unkeyed' : 'none';
}

/** Whether this device keeps any key it set aside, whichever account it belongs to. */
export async function holdsSetAsideKeys(keyStore: KeyValueStore): Promise<boolean> {
  const parked = await readSetAsideSlot<ParkedDataKeys>(keyStore, SYNC_PARKED_DATA_KEYS);
  if (parked !== null && Object.keys(parked).length > 0) {
    return true;
  }
  return (await readSetAsideSlot<StoredKey>(keyStore, SYNC_UNBOUND_DATA_KEY)) !== null;
}
