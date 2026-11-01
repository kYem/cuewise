import {
  CONTENT_SETTINGS_KEYS,
  DEFAULT_SETTINGS,
  DEVICE_LOCAL_SETTINGS_KEYS,
  logger,
  type Settings,
  STORAGE_KEYS,
  type StoredValues,
  settingsSchema,
  storageFailure,
} from '@cuewise/shared';
import type { ZodMiniType } from 'zod/mini';
import {
  getFromStorage,
  getManyFromStorage,
  listStorageKeys,
  removeFromStorage,
  removeManyFromStorage,
  type StorageResult,
  setInStorage,
  setManyInStorage,
} from './chrome-storage';

/**
 * Get the storage area based on user settings
 * Settings are always stored in local storage to avoid circular dependency
 *
 * Awaits the migration first: until it runs, syncEnabled is absent and every collection here
 * would resolve to 'local', reading a sync user's data as empty and then writing that back.
 *
 * Throws when the read fails, rather than answering an area it cannot know — every caller
 * already surfaces that as an error state, which is recoverable where a wrong area is not.
 */
export async function getStorageArea(): Promise<'local' | 'sync'> {
  const migrated = await ensureSettingsMigrated();
  // The flag rides along in the batch this call already makes: it is proof a past run copied the
  // blob out, so a realm whose own migration read just failed still answers instead of refusing.
  const stored = await getManyFromStorage(
    [SETTINGS_SYNC_ENABLED_KEY, STORAGE_KEYS.SETTINGS_MIGRATED],
    'local'
  );
  if (stored === null) {
    // Answering 'local' on a guess reads a sync user's data as empty, and the sync cycle then
    // seals every dirty entity as a deletion for every other device.
    logger.error('Could not read syncEnabled; refusing to guess the storage area');
    throw new Error('Could not determine the storage area: the settings read failed');
  }
  const perKey = stored[SETTINGS_SYNC_ENABLED_KEY];
  if (perKey !== undefined && !perKey.readable) {
    logger.error('syncEnabled is stored but unreadable; refusing to guess the storage area');
    throw new Error('Could not determine the storage area: syncEnabled is unreadable');
  }
  let syncEnabled: unknown = DEFAULT_SETTINGS.syncEnabled;
  if (perKey?.readable === true && settingsValueIsValid('syncEnabled', perKey.value)) {
    syncEnabled = perKey.value;
  } else if (!migrated && !settingsMigrationCompleted(stored)) {
    // Absence means "never chose" only once the migration has copied the blob out; before that it
    // means the choice is in a blob nothing reads any more, so defaulting it is still a guess.
    logger.error('The settings migration has not run; refusing to guess the storage area');
    throw new Error('Could not determine the storage area: the settings migration has not run');
  }
  if (syncEnabled === true) {
    return 'sync';
  }
  return 'local';
}

// Settings — one storage key per setting, always in the local area.
// Sparse on purpose: an absent key means "follow the current default", so shipping a changed
// default reaches everyone who never chose otherwise. Any explicit write stores the key even
// when the value equals the default, so a deliberate reset still syncs.
export const SETTINGS_KEY_PREFIX = 'settings.';

export function settingsStorageKey(key: string): string {
  return `${SETTINGS_KEY_PREFIX}${key}`;
}

export const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

const SETTINGS_STORAGE_KEYS = SETTINGS_KEYS.map(settingsStorageKey);

const SETTINGS_SYNC_ENABLED_KEY = settingsStorageKey('syncEnabled');

/**
 * The migration's completion flag, read out of a batch the caller already needed. Only an
 * explicit `true` counts: absent, unreadable or any other value reads as "may never have run",
 * which is what stops a sparse per-key entry being mistaken for a value the user never set.
 */
function settingsMigrationCompleted(stored: StoredValues): boolean {
  const entry = stored[STORAGE_KEYS.SETTINGS_MIGRATED];
  return entry?.readable === true && entry.value === true;
}

const SETTINGS_FIELD_SCHEMAS = settingsSchema.def.shape as Record<string, ZodMiniType | undefined>;

/** Own properties only — a stored key named `constructor` or `toString` otherwise hits Object.prototype. */
function settingsFieldSchema(key: string): ZodMiniType | undefined {
  if (!Object.hasOwn(SETTINGS_FIELD_SCHEMAS, key)) {
    return undefined;
  }
  return SETTINGS_FIELD_SCHEMAS[key];
}

/** A key with no schema is a newer build's, so there is nothing to judge it against. */
function settingsValueIsValid(key: string, value: unknown): boolean {
  const fieldSchema = settingsFieldSchema(key);
  if (fieldSchema === undefined) {
    return true;
  }
  return fieldSchema.safeParse(value).success;
}

/**
 * Field-wise, never all-or-nothing: one unreadable value must not reset every preference —
 * including `syncEnabled`, which picks the storage area, making synced data read as empty.
 */
function keepReadableSettingsFields(values: Record<string, unknown>): Partial<Settings> {
  const kept: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const key of SETTINGS_KEYS) {
    const value = values[key];
    if (value === undefined) {
      continue;
    }
    if (settingsValueIsValid(key, value)) {
      kept[key] = value;
    } else {
      dropped.push(key);
    }
  }
  if (dropped.length > 0) {
    // Names only — a setting's value can be a goal id or a playlist the user picked.
    logger.error('Ignored unreadable settings fields, using their defaults', { fields: dropped });
  }
  return kept as Partial<Settings>;
}

interface SettingsEntries {
  values: Record<string, unknown>;
  /** Stored but unreadable — not the same as never written, and never defaulted silently. */
  unreadable: string[];
}

// Nothing to seed for a key this build cannot name: it sits in its own entry, which no patch
// rewrites. Null when the read failed, so no caller mistakes that for a stored default.
async function readSettingsEntries(): Promise<SettingsEntries | null> {
  // Absence means the default only once the migration has copied the blob out; before that the
  // value may still be in a blob nothing reads, which is not the same as never written. The flag
  // rides along so a realm whose own migration read just failed still trusts a past run's copy.
  const migrated = await ensureSettingsMigrated();
  const stored = await getManyFromStorage(
    [...SETTINGS_STORAGE_KEYS, STORAGE_KEYS.SETTINGS_MIGRATED],
    'local'
  );
  if (stored === null) {
    return null;
  }
  const uncopied = !migrated && !settingsMigrationCompleted(stored);
  const values: Record<string, unknown> = {};
  const unreadable: string[] = [];
  for (const key of SETTINGS_KEYS) {
    const entry = stored[settingsStorageKey(key)];
    if (entry === undefined) {
      if (uncopied) {
        unreadable.push(key);
      }
    } else if (entry.readable) {
      values[key] = entry.value;
    } else {
      unreadable.push(key);
    }
  }
  return { values, unreadable };
}

/**
 * A refusal names the corrupt fields; an empty `unreadable` means the read itself failed, which
 * no reset can fix and no field name describes.
 */
export type SettingsRead = { ok: true; settings: Settings } | { ok: false; unreadable: string[] };

/**
 * `ok: false` when any field could not be read — for callers that must not act on a guess. A field
 * that is stored but unreadable is refused too, not defaulted: `autoRollDueTasks` defaults to on,
 * so defaulting it re-dates every overdue task of a user who turned it off, on every device.
 * `getSettings` is the display path and defaults field-wise; a gate would read that as consent.
 */
export async function readSettings(): Promise<SettingsRead> {
  const entries = await readSettingsEntries();
  if (entries === null) {
    logger.error('Could not read the stored settings; refusing to answer with defaults');
    return { ok: false, unreadable: [] };
  }
  if (entries.unreadable.length > 0) {
    // Names only — a setting's value can be a goal id or a playlist the user picked.
    logger.error('Refusing to default settings fields that are stored but unreadable', {
      fields: entries.unreadable,
    });
    return { ok: false, unreadable: entries.unreadable };
  }
  return {
    ok: true,
    settings: { ...DEFAULT_SETTINGS, ...keepReadableSettingsFields(entries.values) },
  };
}

export async function getSettings(): Promise<Settings> {
  const entries = await readSettingsEntries();
  if (entries === null) {
    logger.error('Could not read the stored settings; using defaults for this read');
    return { ...DEFAULT_SETTINGS };
  }
  if (entries.unreadable.length > 0) {
    // Names only — a setting's value can be a goal id or a playlist the user picked.
    logger.error('Defaulting settings fields that are stored but unreadable', {
      fields: entries.unreadable,
    });
  }
  return { ...DEFAULT_SETTINGS, ...keepReadableSettingsFields(entries.values) };
}

/**
 * Raw bytes of the legacy blob; null when never stored or unreadable (the port conflates them).
 * Exported only for the migration tests below — production code has no reason to read the
 * legacy shape once `migrateLegacySettings` has run.
 */
export async function readLegacySettingsBlob(): Promise<Record<string, unknown> | null> {
  const raw = await getFromStorage<unknown>(STORAGE_KEYS.SETTINGS, 'local');
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  return raw as Record<string, unknown>;
}

// Migration first: it fills gaps from the legacy blob, so a write that lands before it would be
// read back as a gap and overwritten by the older value.
async function writeSettingsEntries(patch: Partial<Settings>): Promise<StorageResult> {
  await ensureSettingsMigrated();
  // `undefined` is not storable — localStorage would keep the string "undefined" and throw on
  // every later read. Omitting a key is how a caller says "leave it alone".
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  return setManyInStorage(
    Object.fromEntries(entries.map(([key, value]) => [settingsStorageKey(key), value])),
    'local'
  );
}

/**
 * The unjudged write, for sync applying a value from a peer on another version: our schema is
 * not its schema, and the value costs its own key alone, which every read defaults meanwhile.
 * Device-local keys are dropped here (not just by `collections.ts`'s caller) so any future
 * caller of this path structurally cannot write `syncEnabled` and break area routing.
 */
export async function setSettingsPatchRaw(patch: Partial<Settings>): Promise<StorageResult> {
  const shared = Object.fromEntries(
    Object.entries(patch).filter(([key]) => !DEVICE_LOCAL_SETTINGS_KEYS.includes(key))
  );
  return writeSettingsEntries(shared);
}

/**
 * A value that fails its schema fails the whole patch: every read would hand back the default
 * instead, so a change the user asked for would look saved and never take effect.
 *
 * Writes device-local keys too — this is the path the user's own UI saves through, and the
 * raw path's filter belongs to sync alone.
 */
export async function setSettingsPatch(patch: Partial<Settings>): Promise<StorageResult> {
  const rejected = Object.keys(patch).filter(
    (key) => !settingsValueIsValid(key, patch[key as keyof Settings])
  );
  if (rejected.length > 0) {
    // Names only — a setting's value can be a goal id or a playlist the user picked.
    logger.error('Refused a settings write that does not match its schema', { fields: rejected });
    return storageFailure(`Settings values do not match their schema: ${rejected.join(', ')}`);
  }
  return writeSettingsEntries(patch);
}

export async function clearSettings(): Promise<boolean> {
  // Migrate first: the migration reads an absent per-key entry as a gap to fill, so one still in
  // flight would write the cleared values back in behind the reset.
  await ensureSettingsMigrated();
  // Enumerated, not derived from DEFAULT_SETTINGS: the migration carries unknown keys across and
  // sync writes whatever a newer peer sends, so a build-time list leaves them to resurface.
  const stored = await listStorageKeys(SETTINGS_KEY_PREFIX, 'local');
  if (stored === null) {
    logger.error('Could not list the stored settings keys; nothing was reset');
    return false;
  }
  // The blob goes too — a reset should not leave a copy of what it cleared — but never the
  // completion flag, which is what stops the migration restoring the blob's values afterwards.
  // Content keys survive: resetting preferences must not delete what the user wrote. A corrupt
  // entry goes though — reset is the advertised repair for an unreadable value, note included.
  const contentKeys = CONTENT_SETTINGS_KEYS.map(settingsStorageKey);
  const entries = await getManyFromStorage(contentKeys, 'local');
  const preserved = new Set(contentKeys.filter((key) => entries?.[key]?.readable !== false));
  const toRemove = new Set(
    [...SETTINGS_STORAGE_KEYS, ...stored, STORAGE_KEYS.SETTINGS].filter(
      (key) => !preserved.has(key)
    )
  );
  return removeManyFromStorage([...toRemove], 'local');
}

/**
 * The legacy blob, with the cases the migration has to tell apart: never stored, stored but not
 * readable as settings, and readable.
 */
type LegacyBlobEntry = { stored: false } | { stored: true; blob: Record<string, unknown> | null };

function legacyBlobEntry(stored: StoredValues): LegacyBlobEntry {
  const entry = stored[STORAGE_KEYS.SETTINGS];
  if (entry === undefined) {
    return { stored: false };
  }
  if (!entry.readable) {
    return { stored: true, blob: null };
  }
  const value = entry.value;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { stored: true, blob: null };
  }
  return { stored: true, blob: value as Record<string, unknown> };
}

/**
 * After the flag, never before: a blob removed with no flag would leave a device with neither a
 * source nor a record of having migrated. A failed removal only strands bytes no read consults.
 */
async function deleteLegacyBlob(): Promise<void> {
  if (!(await removeFromStorage(STORAGE_KEYS.SETTINGS, 'local'))) {
    logger.error('Could not delete the migrated settings blob; it is inert but still on disk');
  }
}

/** Written only after the per-key entries land: it is what retires the blob as a source. */
async function markSettingsMigrated(): Promise<boolean> {
  const result = await setInStorage(STORAGE_KEYS.SETTINGS_MIGRATED, true, 'local');
  if (!result.success) {
    logger.error('Could not flag the settings migration; it will run again', result.error);
    return false;
  }
  return true;
}

/**
 * One-time copy from the legacy settings blob into per-key entries, followed by deleting the blob.
 * Idempotent and safe to run in more than one realm: it fills only gaps, so a value a sync pull
 * already wrote is never clobbered, and it writes nothing at all through the store, so no key is
 * ever marked dirty for sync.
 *
 * The flag alone does not end the run: the release that introduced it kept the blob as a rollback,
 * so an already-flagged device still has one to collect, and this is the only path that reaches it.
 *
 * Resolves false only while values are still uncopied. Nothing back-stops the per-key entries
 * meanwhile, so every read refuses rather than mistaking an uncopied value for one never set.
 */
export async function migrateLegacySettings(): Promise<boolean> {
  const stored = await getManyFromStorage(
    [STORAGE_KEYS.SETTINGS_MIGRATED, STORAGE_KEYS.SETTINGS],
    'local'
  );
  if (stored === null) {
    logger.error('Could not read the legacy settings blob; the migration will run again');
    return false;
  }
  const legacy = legacyBlobEntry(stored);
  if (settingsMigrationCompleted(stored)) {
    if (legacy.stored) {
      await deleteLegacyBlob();
    }
    return true;
  }
  if (!legacy.stored) {
    // Fresh install: nothing was left uncopied, so an absent per-key entry already means the
    // default. The flag only stops this repeating; a write that failed must not make reads refuse.
    await markSettingsMigrated();
    return true;
  }
  if (legacy.blob === null) {
    // Unreadable is JSON.parse throwing, which no retry fixes — refusing every read would hold the
    // app hostage to values already lost. Flag so reads default, but keep the bytes: unparseable to
    // this build is not unsalvageable, and they are the only copy left.
    logger.error('The legacy settings blob is unreadable; defaulting its values and keeping it');
    await markSettingsMigrated();
    return true;
  }
  const blob = legacy.blob;

  const existing = await getManyFromStorage(Object.keys(blob).map(settingsStorageKey), 'local');
  if (existing === null) {
    // Every key would look like a gap, so the blob's older values would overwrite what a sync
    // pull already wrote.
    logger.error('Could not read the per-key settings entries; the migration will run again');
    return false;
  }
  const patch: Record<string, unknown> = {};
  const discarded: string[] = [];
  for (const [key, value] of Object.entries(blob)) {
    const storageKey = settingsStorageKey(key);
    // An unreadable entry is filled too: its bytes are garbage no read can use, so the blob's
    // value is strictly better than leaving it.
    const entry = existing[storageKey];
    if (entry?.readable === true) {
      continue;
    }
    const fieldSchema = settingsFieldSchema(key);
    if (fieldSchema === undefined) {
      // A key this build does not know, carried across so the flag does not strand it.
      patch[storageKey] = value;
      continue;
    }
    if (!fieldSchema.safeParse(value).success) {
      discarded.push(key);
      continue;
    }
    // Structural compare — two settings hold arrays, which never compare equal by identity.
    if (JSON.stringify(value) === JSON.stringify(DEFAULT_SETTINGS[key as keyof Settings])) {
      continue;
    }
    patch[storageKey] = value;
  }

  // Before the flag, never after: the flag is what lets a read treat an absent key as a default,
  // so a flag that outran its entries would default every key the write never landed.
  if (Object.keys(patch).length > 0) {
    const result = await setManyInStorage(patch, 'local');
    if (!result.success) {
      // Unflagged, so every read refuses instead of serving defaults for values still in the blob.
      logger.error('Settings migration write failed; leaving it unflagged', result.error);
      return false;
    }
  }

  if (discarded.length > 0) {
    // Names only — a setting's value can be a goal id or a playlist the user picked.
    logger.error('Dropping legacy settings values that do not match their schema', {
      fields: discarded,
    });
  }

  // The copy landed, so an absent per-key entry already means the default whether or not the flag
  // stored. Refusing every read over the flag alone would wedge a device whose storage is full.
  if (await markSettingsMigrated()) {
    await deleteLegacyBlob();
  }
  return true;
}

let settingsMigration: Promise<boolean> | null = null;

/**
 * Runs the legacy-blob migration once per realm; every settings read awaits it, so no
 * caller has to order it. migrateLegacySettings must never call this — it reads and writes with
 * an explicit 'local' area rather than through getStorageArea, which keeps that from recursing.
 *
 * Resolves whether the move completed, because that is what tells a read whether an absent
 * per-key entry is a value the user never set or one still sitting in an uncopied blob.
 */
export function ensureSettingsMigrated(): Promise<boolean> {
  if (settingsMigration === null) {
    // Neither an incomplete run nor a rejection is memoized: getStorageArea awaits this on nearly
    // every storage call, so a cached failure would freeze the migration for the whole session.
    settingsMigration = migrateLegacySettings()
      .then((completed) => {
        if (!completed) {
          settingsMigration = null;
        }
        return completed;
      })
      .catch((error: unknown) => {
        settingsMigration = null;
        throw error;
      });
  }
  return settingsMigration;
}

/** Drops the memo so the next read migrates again. For test isolation. */
export function resetSettingsMigration(): void {
  settingsMigration = null;
}

/**
 * The keys the user explicitly wrote — never the defaults standing in for the rest. Refuses on
 * unreadable fields like getSettingsForSync: an uncopied migration reports absent keys there,
 * and answering the partial set would enroll without ever claiming the blob-held choices.
 */
export async function getStoredSettingsKeys(): Promise<string[]> {
  const entries = await readSettingsEntries();
  if (entries === null) {
    throw new Error('Could not read the stored settings keys: the settings read failed');
  }
  if (entries.unreadable.length > 0) {
    logger.error('Refusing to answer the stored settings keys with unreadable fields', {
      fields: entries.unreadable,
    });
    throw new Error(
      `Could not read the stored settings keys: ${entries.unreadable.join(', ')} unreadable`
    );
  }
  return Object.keys(entries.values).filter((key) => entries.values[key] !== undefined);
}

/** Defaults fill only what was never written; nothing is defaulted for being unreadable. */
export async function getSettingsForSync(): Promise<Settings> {
  const entries = await readSettingsEntries();
  if (entries === null) {
    // Our defaults would win LWW over the value every peer actually chose.
    throw new Error('Could not read the settings to push: the settings read failed');
  }
  if (entries.unreadable.length > 0) {
    logger.error('Refusing to push settings with unreadable fields', {
      fields: entries.unreadable,
    });
    throw new Error(
      `Could not read the settings to push: ${entries.unreadable.join(', ')} unreadable`
    );
  }
  const present = Object.fromEntries(
    Object.entries(entries.values).filter(([, value]) => value !== undefined)
  );
  return { ...DEFAULT_SETTINGS, ...present } as Settings;
}
