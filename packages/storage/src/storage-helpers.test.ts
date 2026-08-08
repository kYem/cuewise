import {
  configurePlatform,
  DEFAULT_SETTINGS,
  type KeyValueStore,
  logger,
  type Settings,
  STORAGE_KEYS,
  type StorageArea,
  type StorageUsage,
  type StoredValues,
  type SyncMutationSink,
  storedValue,
  toStoredValues,
  UNREADABLE_VALUE,
} from '@cuewise/shared';
import { goalFactory, quoteFactory } from '@cuewise/test-utils/factories';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFromStorage, getManyFromStorage, setInStorage } from './chrome-storage';
import { LocalStorageKeyValueStore } from './local-storage-key-value-store';
import {
  clearCustomBackground,
  clearSettings,
  ensureSettingsMigrated,
  getCustomBackground,
  getGoals,
  getSettings,
  getSettingsForSync,
  getStorageUsage,
  isCustomQuote,
  migrateLegacySettings,
  readLegacySettingsBlob,
  readSettings,
  resetSettingsMigration,
  SETTINGS_KEYS,
  setCustomBackground,
  setSettingsPatch,
  setSettingsPatchRaw,
  settingsStorageKey,
} from './storage-helpers';

// The migration memo lives at module scope, so an earlier test's run would satisfy a later one.
beforeEach(() => {
  vi.restoreAllMocks();
  resetSettingsMigration();
});

// structuredClone, not a spread: real chrome.storage always returns a new array instance on
// read, and only structuredClone reproduces that — a spread would leave arrays reference-equal.
function legacyBlob(overrides: Partial<Settings>): Settings {
  return { ...structuredClone(DEFAULT_SETTINGS), ...overrides };
}

// Fake store: no settings stored (→ syncEnabled false → 'local' area), fixed usage.
function fakeStore(usage: StorageUsage): KeyValueStore {
  return {
    supportsSync: true,
    get: async () => null,
    set: async () => ({ success: true }),
    remove: async () => true,
    getMany: async () => ({}),
    keys: async () => [],
    setMany: async () => ({ success: true }),
    removeMany: async () => true,
    getUsage: async () => usage,
  };
}

describe('getStorageUsage', () => {
  it('computes percentage and flags a warning above 75%', async () => {
    configurePlatform({ storage: fakeStore({ bytesInUse: 8_000_000, quota: 10_000_000 }) });

    const info = await getStorageUsage();

    expect(info).toMatchObject({
      available: true,
      percentageUsed: 80,
      isWarning: true,
      isCritical: false,
    });
  });

  it('flags critical above 90%', async () => {
    configurePlatform({ storage: fakeStore({ bytesInUse: 9_500_000, quota: 10_000_000 }) });

    const info = await getStorageUsage();

    expect(info).toMatchObject({ available: true, isCritical: true });
  });
});

// Records what was written so tests can assert round-trips through the real helpers.
// Keeps the two areas apart, like chrome.storage does, so area routing is observable.
function recordingStore(initial: Partial<Record<StorageArea, Record<string, unknown>>> = {}) {
  const areas: Record<StorageArea, Record<string, unknown>> = {
    local: { ...initial.local },
    sync: { ...initial.sync },
  };
  const store: KeyValueStore = {
    supportsSync: true,
    get: async <T>(key: string, area: StorageArea) => (areas[area][key] ?? null) as T | null,
    set: async <T>(key: string, value: T, area: StorageArea) => {
      areas[area][key] = value;
      return { success: true } as const;
    },
    remove: async (key: string, area: StorageArea) => {
      delete areas[area][key];
      return true;
    },
    getMany: async (keys: string[], area: StorageArea) => {
      const result: StoredValues = {};
      for (const key of keys) {
        if (key in areas[area]) {
          result[key] = storedValue(areas[area][key]);
        }
      }
      return result;
    },
    keys: async (prefix: string, area: StorageArea) =>
      Object.keys(areas[area]).filter((key) => key.startsWith(prefix)),
    setMany: async (entries: Record<string, unknown>, area: StorageArea) => {
      Object.assign(areas[area], entries);
      return { success: true };
    },
    removeMany: async (keys: string[], area: StorageArea) => {
      for (const key of keys) {
        delete areas[area][key];
      }
      return true;
    },
    getUsage: async () => ({ bytesInUse: 0, quota: 10_000_000 }),
  };
  return { store, areas };
}

describe('custom background', () => {
  it('returns null when the user has not set one', async () => {
    const { store } = recordingStore();
    configurePlatform({ storage: store });

    await expect(getCustomBackground()).resolves.toBeNull();
  });

  it('round-trips a stored image', async () => {
    const { store } = recordingStore();
    configurePlatform({ storage: store });

    await setCustomBackground('data:image/jpeg;base64,abc');

    await expect(getCustomBackground()).resolves.toBe('data:image/jpeg;base64,abc');
  });

  it('reports the failure when the image is too large to store', async () => {
    const { store } = recordingStore();
    configurePlatform({
      storage: {
        ...store,
        set: async () => ({
          success: false as const,
          error: { type: 'quota_exceeded' as const, message: 'Image too large' },
        }),
      },
    });

    const result = await setCustomBackground('data:image/jpeg;base64,huge');

    expect(result.success).toBe(false);
  });

  it('forgets the image once cleared', async () => {
    const { store } = recordingStore();
    configurePlatform({ storage: store });
    await setCustomBackground('data:image/jpeg;base64,abc');

    const result = await clearCustomBackground();

    expect(result.success).toBe(true);
    await expect(getCustomBackground()).resolves.toBeNull();
  });

  it('reports a failed delete instead of implying the image is gone', async () => {
    const { store } = recordingStore();
    configurePlatform({ storage: { ...store, remove: async () => false } });

    const result = await clearCustomBackground();

    expect(result.success).toBe(false);
  });
});

describe('settings', () => {
  it('getSettings falls back to the default for absent keys', async () => {
    const { store } = recordingStore();
    configurePlatform({ storage: store });

    await setSettingsPatch({ showClock: true });

    const settings = await getSettings();

    expect(settings.showClock).toBe(true);
    expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(settings.colorTheme).toBe(DEFAULT_SETTINGS.colorTheme);
  });

  it('setSettingsPatch writes only the keys in the patch', async () => {
    const { store } = recordingStore();
    configurePlatform({ storage: store });

    await setSettingsPatch({ showClock: true, theme: 'dark' });

    const stored = (await getManyFromStorage(SETTINGS_KEYS.map(settingsStorageKey))) ?? {};

    expect(Object.keys(stored).sort()).toEqual(['settings.showClock', 'settings.theme'].sort());
  });

  it('a later patch leaves earlier keys untouched', async () => {
    const { store } = recordingStore();
    configurePlatform({ storage: store });

    await setSettingsPatch({ showClock: true });
    await setSettingsPatch({ theme: 'dark' });

    const settings = await getSettings();

    expect(settings.showClock).toBe(true);
    expect(settings.theme).toBe('dark');
  });

  // The UI saves through this path; only the sync path may drop these.
  it('setSettingsPatch persists the device-local keys the UI owns', async () => {
    const { store } = recordingStore();
    configurePlatform({ storage: store });

    await setSettingsPatch({
      syncEnabled: true,
      logLevel: 'debug',
      focusedGoalId: 'g1',
      hasSeenOnboarding: true,
    });

    await expect(getSettings()).resolves.toMatchObject({
      syncEnabled: true,
      logLevel: 'debug',
      focusedGoalId: 'g1',
      hasSeenOnboarding: true,
    });
  });

  it('setSettingsPatch stores an unknown key named after an Object.prototype member', async () => {
    const { store, areas } = recordingStore();
    configurePlatform({ storage: store });

    const result = await setSettingsPatch({ toString: 'from-a-newer-build' } as never);

    expect(result.success).toBe(true);
    expect(areas.local[settingsStorageKey('toString')]).toBe('from-a-newer-build');
  });

  it('clearSettings removes every settings key so defaults apply again', async () => {
    const { store } = recordingStore();
    configurePlatform({ storage: store });

    await setSettingsPatch({ showClock: true, theme: 'dark' });

    await clearSettings();

    const settings = await getSettings();
    expect(settings.showClock).toBe(DEFAULT_SETTINGS.showClock);
    expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it('clearSettings holds when the legacy blob has not migrated yet', async () => {
    const { store } = recordingStore();
    configurePlatform({ storage: store });
    await setInStorage(STORAGE_KEYS.SETTINGS, legacyBlob({ theme: 'dark' }), 'local');

    await clearSettings();

    await expect(getSettings()).resolves.toMatchObject({ theme: DEFAULT_SETTINGS.theme });
  });

  // The migration's quota path keeps the blob on purpose, so a reset that left it there would
  // be undone on the next reload — every reload, once the quota frees up again.
  it('clearSettings deletes a legacy blob the migration could not clear', async () => {
    const { store } = recordingStore();
    configurePlatform({
      storage: {
        ...store,
        setMany: async () => ({
          success: false as const,
          error: { type: 'quota_exceeded' as const, message: 'Storage full' },
        }),
      },
    });
    await setInStorage(STORAGE_KEYS.SETTINGS, legacyBlob({ theme: 'dark' }), 'local');
    await getSettings();

    // Space is free again, and the reset is what the user does next.
    configurePlatform({ storage: store });
    await clearSettings();
    resetSettingsMigration();

    await expect(getSettings()).resolves.toMatchObject({ theme: DEFAULT_SETTINGS.theme });
  });

  // The blob is dense — every key was materialized on the user's first save — so while a read
  // consults it, a key the migration left at its default is frozen at the blob's value forever.
  it('a flagged read follows a changed default, not the value still in the blob', async () => {
    const { store, areas } = recordingStore();
    configurePlatform({ storage: store });
    await setInStorage(STORAGE_KEYS.SETTINGS, legacyBlob({ theme: 'dark' }), 'local');
    await ensureSettingsMigrated();

    // What shipping a new default looks like from the read's side: the blob still holds the old
    // one for a key the migration wrote no per-key entry for.
    areas.local[STORAGE_KEYS.SETTINGS] = legacyBlob({ theme: 'dark', colorTheme: 'forest' });

    await expect(getSettings()).resolves.toMatchObject({
      theme: 'dark',
      colorTheme: DEFAULT_SETTINGS.colorTheme,
    });
  });

  it('a changed default reaches a user who never set that key', async () => {
    const { store } = recordingStore();
    configurePlatform({ storage: store });

    await setSettingsPatch({ theme: 'dark' });

    const settings = await getSettings();

    // showClock was never written, so it tracks DEFAULT_SETTINGS rather than a frozen copy.
    expect(settings.showClock).toBe(DEFAULT_SETTINGS.showClock);
    expect(await getManyFromStorage(['settings.showClock'])).toEqual({});
  });
});

describe('setSettingsPatchRaw', () => {
  it('refuses a device-local key regardless of caller', async () => {
    const { store, areas } = recordingStore();
    configurePlatform({ storage: store });

    await setSettingsPatchRaw({ syncEnabled: true });

    expect(areas.local[settingsStorageKey('syncEnabled')]).toBeUndefined();
  });

  it('still writes the other keys in the same patch', async () => {
    const { store, areas } = recordingStore();
    configurePlatform({ storage: store });

    await setSettingsPatchRaw({ syncEnabled: true, theme: 'dark' });

    expect(areas.local[settingsStorageKey('syncEnabled')]).toBeUndefined();
    expect(areas.local[settingsStorageKey('theme')]).toBe('dark');
  });
});

describe('migrateLegacySettings', () => {
  // A prior describe block may leave the platform pointed at its own recordingStore
  // (each test there reconfigures it but nothing restores the default afterward) —
  // start every test here from a fresh store so runs don't depend on file order.
  beforeEach(() => {
    const { store } = recordingStore();
    configurePlatform({ storage: store });
  });

  afterEach(() => {
    configurePlatform({ syncSink: null });
  });

  it('migrates only the keys that differ from the current default', async () => {
    await setInStorage(STORAGE_KEYS.SETTINGS, legacyBlob({ theme: 'dark' }), 'local');

    await migrateLegacySettings();

    const stored = await getManyFromStorage(SETTINGS_KEYS.map(settingsStorageKey));
    expect(stored).toEqual(toStoredValues({ 'settings.theme': 'dark' }));
  });

  // Written through the store, not through setSettingsPatch: that path runs the whole migration
  // first, which deletes the blob and leaves this with nothing to guard against.
  it('does not overwrite a per-key value that landed before it ran', async () => {
    await setInStorage(STORAGE_KEYS.SETTINGS, legacyBlob({ theme: 'dark' }), 'local');
    await setInStorage(settingsStorageKey('theme'), 'light', 'local');

    await migrateLegacySettings();

    const settings = await getSettings();
    expect(settings.theme).toBe('light');
  });

  // Without a read it can trust, every key looks like a gap: the blob's older values would
  // overwrite what a sync pull already wrote, and the delete would take the only copy with them.
  it('keeps the legacy blob and writes nothing when it cannot read the per-key entries', async () => {
    const blob = legacyBlob({ theme: 'dark' });
    const { store, areas } = recordingStore({ local: { [STORAGE_KEYS.SETTINGS]: blob } });
    configurePlatform({ storage: { ...store, getMany: async () => null } });

    await migrateLegacySettings();

    expect(await readLegacySettingsBlob()).toEqual(blob);
    expect(areas.local[settingsStorageKey('theme')]).toBeUndefined();
  });

  it('keeps the legacy blob when the per-key write fails', async () => {
    const { store } = recordingStore();
    configurePlatform({
      storage: {
        ...store,
        setMany: async () => ({
          success: false as const,
          error: { type: 'quota_exceeded' as const, message: 'Storage full' },
        }),
      },
    });
    const blob = legacyBlob({ theme: 'dark' });
    await setInStorage(STORAGE_KEYS.SETTINGS, blob, 'local');

    await migrateLegacySettings();

    expect(await readLegacySettingsBlob()).toEqual(blob);
  });

  it('flags the move and deletes the legacy blob', async () => {
    await setInStorage(STORAGE_KEYS.SETTINGS, legacyBlob({ theme: 'dark' }), 'local');

    await expect(migrateLegacySettings()).resolves.toBe(true);

    expect(await readLegacySettingsBlob()).toBeNull();
    await expect(getFromStorage(STORAGE_KEYS.SETTINGS_MIGRATED, 'local')).resolves.toBe(true);
  });

  it('flags the move even when the blob will not delete, and says so', async () => {
    const blob = legacyBlob({ theme: 'dark' });
    const { store } = recordingStore({ local: { [STORAGE_KEYS.SETTINGS]: blob } });
    configurePlatform({ storage: { ...store, remove: async () => false } });
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(migrateLegacySettings()).resolves.toBe(true);

    await expect(getFromStorage(STORAGE_KEYS.SETTINGS_MIGRATED, 'local')).resolves.toBe(true);
    expect(await readLegacySettingsBlob()).toEqual(blob);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('still on disk'));
  });

  // The release that introduced the flag kept the blob as a rollback, so every device that
  // migrated then is already flagged — the only population with bytes left to collect.
  it('deletes a blob left behind by a migration that already flagged', async () => {
    const { store, areas } = recordingStore({
      local: {
        [STORAGE_KEYS.SETTINGS]: legacyBlob({ theme: 'dark' }),
        [STORAGE_KEYS.SETTINGS_MIGRATED]: true,
        [settingsStorageKey('theme')]: 'dark',
      },
    });
    configurePlatform({ storage: store });

    await expect(migrateLegacySettings()).resolves.toBe(true);

    expect(await readLegacySettingsBlob()).toBeNull();
    expect(areas.local[settingsStorageKey('theme')]).toBe('dark');
  });

  it('does nothing when there is no legacy blob', async () => {
    await migrateLegacySettings();

    const stored = await getManyFromStorage(SETTINGS_KEYS.map(settingsStorageKey));
    expect(stored).toEqual({});
  });

  it('flags a fresh install that has no blob to migrate', async () => {
    await expect(migrateLegacySettings()).resolves.toBe(true);

    await expect(getFromStorage(STORAGE_KEYS.SETTINGS_MIGRATED, 'local')).resolves.toBe(true);
  });

  // A device with no blob left nothing uncopied, so a flag write it could not store must not
  // take every read down with it — the flag is only what stops the run repeating.
  it('lets reads default when a fresh install cannot store the flag', async () => {
    const { store } = recordingStore();
    configurePlatform({
      storage: {
        ...store,
        set: async () => ({
          success: false as const,
          error: { type: 'quota_exceeded' as const, message: 'Storage full' },
        }),
      },
    });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(readSettings()).resolves.toMatchObject({ ok: true });
    await expect(getGoals()).resolves.toEqual([]);
  });

  it('does not copy the blob again once flagged', async () => {
    const { store, areas } = recordingStore({
      local: {
        [STORAGE_KEYS.SETTINGS]: legacyBlob({ theme: 'dark' }),
        [STORAGE_KEYS.SETTINGS_MIGRATED]: true,
      },
    });
    const readKeys: string[] = [];
    configurePlatform({
      storage: {
        ...store,
        get: async <T>(key: string, area: StorageArea) => {
          readKeys.push(key);
          return store.get<T>(key, area);
        },
        getMany: async (keys: string[], area: StorageArea) => {
          readKeys.push(...keys);
          return store.getMany(keys, area);
        },
      },
    });

    await expect(migrateLegacySettings()).resolves.toBe(true);

    expect(readKeys).toEqual([STORAGE_KEYS.SETTINGS_MIGRATED, STORAGE_KEYS.SETTINGS]);
    expect(areas.local[settingsStorageKey('theme')]).toBeUndefined();
  });

  it('leaves the flag unset when the per-key write fails, and copies on the next run', async () => {
    const { store, areas } = recordingStore({
      local: { [STORAGE_KEYS.SETTINGS]: legacyBlob({ theme: 'dark' }) },
    });
    let writesFail = true;
    configurePlatform({
      storage: {
        ...store,
        setMany: async (entries: Record<string, unknown>, area: StorageArea) => {
          if (writesFail) {
            return {
              success: false as const,
              error: { type: 'quota_exceeded' as const, message: 'Storage full' },
            };
          }
          return store.setMany(entries, area);
        },
      },
    });

    await expect(migrateLegacySettings()).resolves.toBe(false);
    expect(areas.local[STORAGE_KEYS.SETTINGS_MIGRATED]).toBeUndefined();

    writesFail = false;
    await expect(migrateLegacySettings()).resolves.toBe(true);

    expect(areas.local[settingsStorageKey('theme')]).toBe('dark');
    expect(areas.local[STORAGE_KEYS.SETTINGS_MIGRATED]).toBe(true);
  });

  // The flag would otherwise retire a back-stop this build never copied a single value out of.
  it('leaves the flag unset when the blob is stored but unreadable', async () => {
    const { store, areas } = recordingStore({
      local: { [STORAGE_KEYS.SETTINGS]: legacyBlob({ theme: 'dark' }) },
    });
    configurePlatform({
      storage: {
        ...store,
        getMany: async (keys: string[], area: StorageArea) => {
          const seen = await store.getMany(keys, area);
          if (seen !== null && keys.includes(STORAGE_KEYS.SETTINGS)) {
            seen[STORAGE_KEYS.SETTINGS] = UNREADABLE_VALUE;
          }
          return seen;
        },
      },
    });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(migrateLegacySettings()).resolves.toBe(false);

    expect(areas.local[STORAGE_KEYS.SETTINGS_MIGRATED]).toBeUndefined();
  });

  it('is idempotent across repeated runs', async () => {
    await setInStorage(STORAGE_KEYS.SETTINGS, legacyBlob({ theme: 'dark' }), 'local');

    await migrateLegacySettings();
    await migrateLegacySettings();

    const settings = await getSettings();
    expect(settings.theme).toBe('dark');
  });

  it('migrates array values that differ from the default, and only those', async () => {
    await setInStorage(
      STORAGE_KEYS.SETTINGS,
      legacyBlob({ quoteFilterActiveCollectionIds: ['c1'] }),
      'local'
    );

    await migrateLegacySettings();

    const stored = await getManyFromStorage(SETTINGS_KEYS.map(settingsStorageKey));
    expect(stored).toEqual(toStoredValues({ 'settings.quoteFilterActiveCollectionIds': ['c1'] }));
  });

  // `readLegacySettingsBlob` conflates never-stored, wrong-shape and read-failure into null,
  // so this branch is all that stands between a transient read error and permanent deletion.
  it('leaves a blob it could not read on disk rather than deleting it', async () => {
    await setInStorage(STORAGE_KEYS.SETTINGS, 'not-an-object', 'local');

    await migrateLegacySettings();

    await expect(getFromStorage(STORAGE_KEYS.SETTINGS, 'local')).resolves.toBe('not-an-object');
  });

  it('carries a key named after an Object.prototype member without throwing', async () => {
    const blob = { ...legacyBlob({ theme: 'dark' }), constructor: 'from-a-newer-build' };
    await setInStorage(STORAGE_KEYS.SETTINGS, blob, 'local');

    await migrateLegacySettings();

    await expect(getSettings()).resolves.toMatchObject({ theme: 'dark' });
    expect(await getManyFromStorage([settingsStorageKey('constructor')])).toEqual(
      toStoredValues({ [settingsStorageKey('constructor')]: 'from-a-newer-build' })
    );
  });

  // The one settings path that destroys rather than shadows — names only, never the values.
  it('names the values it discards, without logging what they held', async () => {
    const error = vi.spyOn(logger, 'error');
    await setInStorage(
      STORAGE_KEYS.SETTINGS,
      { ...legacyBlob({}), focusedGoalId: { secret: 'a private goal' } },
      'local'
    );

    await migrateLegacySettings();

    expect(error).toHaveBeenCalledWith(
      'Dropping legacy settings values that do not match their schema',
      { fields: ['focusedGoalId'] }
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('a private goal');
  });

  it('marks nothing dirty for sync, even for the keys it writes', async () => {
    const markMutated = vi.fn();
    const fakeSink: SyncMutationSink = { markMutated, markDeleted: vi.fn() };
    configurePlatform({ syncSink: fakeSink });
    await setInStorage(STORAGE_KEYS.SETTINGS, legacyBlob({ theme: 'dark' }), 'local');

    await migrateLegacySettings();

    expect(markMutated).not.toHaveBeenCalled();
  });
});

// The blob stays on disk when the write fails, and nothing reads it, so those keys have no source
// at all — including `syncEnabled`, which decides the area every other collection lives in.
describe('a migration whose write failed', () => {
  function cannotWriteSettings(
    initial: Partial<Record<StorageArea, Record<string, unknown>>>
  ): KeyValueStore {
    const { store } = recordingStore(initial);
    return {
      ...store,
      setMany: async () => ({
        success: false as const,
        error: { type: 'quota_exceeded' as const, message: 'Storage full' },
      }),
    };
  }

  // Answering 'local' here reads a sync user's data as empty, and the sync cycle then seals every
  // dirty entity as a deletion for every other device.
  it('refuses the storage area rather than reading a sync user as local', async () => {
    configurePlatform({
      storage: cannotWriteSettings({
        local: { [STORAGE_KEYS.SETTINGS]: legacyBlob({ syncEnabled: true }) },
        sync: { [STORAGE_KEYS.GOALS]: goalFactory.buildList(2) },
      }),
    });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(getGoals()).rejects.toThrow(/storage area/i);
  });

  // Our defaults would win LWW over the value every peer actually chose.
  it('refuses to push settings the migration has not copied out', async () => {
    configurePlatform({
      storage: cannotWriteSettings({
        local: { [STORAGE_KEYS.SETTINGS]: legacyBlob({ theme: 'dark' }) },
      }),
    });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(getSettingsForSync()).rejects.toThrow(/unreadable/i);
  });

  it('reads settings as stale rather than serving the defaults it would push', async () => {
    configurePlatform({
      storage: cannotWriteSettings({
        local: { [STORAGE_KEYS.SETTINGS]: legacyBlob({ autoRollDueTasks: false }) },
      }),
    });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(readSettings()).resolves.toMatchObject({
      ok: false,
      unreadable: expect.arrayContaining(['autoRollDueTasks']),
    });
  });

  // Both are live at read time here, and only the per-key entry reflects what was chosen last:
  // the blob is the value the migration has not yet moved.
  it('reads the per-key value, not the blob still on disk', async () => {
    configurePlatform({
      storage: cannotWriteSettings({
        local: {
          [STORAGE_KEYS.SETTINGS]: legacyBlob({ theme: 'dark', colorTheme: 'forest' }),
          [settingsStorageKey('theme')]: 'light',
        },
      }),
    });

    await expect(getSettings()).resolves.toMatchObject({ theme: 'light' });
  });

  // The per-key value is the opposite of the default here, so answering it cannot be confused
  // with the fallback that a missing entry would take.
  it('routes on the per-key syncEnabled, not the blob still on disk', async () => {
    const syncGoals = goalFactory.buildList(2);
    configurePlatform({
      storage: cannotWriteSettings({
        local: {
          [STORAGE_KEYS.SETTINGS]: legacyBlob({ syncEnabled: false, colorTheme: 'forest' }),
          [settingsStorageKey('syncEnabled')]: true,
          [STORAGE_KEYS.GOALS]: goalFactory.buildList(1),
        },
        sync: { [STORAGE_KEYS.GOALS]: syncGoals },
      }),
    });

    await expect(getGoals()).resolves.toEqual(syncGoals);
  });
});

// Absence means "never written, follow the default" everywhere below, so a read that failed
// must never arrive as one — for syncEnabled that would route a sync user to the wrong area.
describe('a settings read that fails', () => {
  function cannotReadSettings(
    initial: Partial<Record<StorageArea, Record<string, unknown>>> = {}
  ): KeyValueStore {
    const { store } = recordingStore(initial);
    return { ...store, getMany: async () => null };
  }

  it('leaves the storage area unanswered rather than guessing local', async () => {
    configurePlatform({
      storage: cannotReadSettings({ sync: { [STORAGE_KEYS.GOALS]: goalFactory.buildList(2) } }),
    });

    await expect(getGoals()).rejects.toThrow(/storage area/i);
  });

  // No field names: nothing on disk is corrupt, so naming keys would send the user to a reset
  // that fixes nothing.
  it('readSettings reports it instead of handing back defaults', async () => {
    configurePlatform({ storage: cannotReadSettings() });

    await expect(readSettings()).resolves.toEqual({ ok: false, unreadable: [] });
  });

  it('getSettings falls back to the defaults', async () => {
    configurePlatform({ storage: cannotReadSettings() });

    await expect(getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('refuses to push settings it could not read', async () => {
    configurePlatform({ storage: cannotReadSettings() });

    await expect(getSettingsForSync()).rejects.toThrow(/settings/i);
  });

  // An all-clear against a quota the user may not be on hides the warning that explains
  // their next failed write — a sync user sits at 100KB, not 10MB.
  it('reports storage usage as unavailable instead of inventing an empty local area', async () => {
    configurePlatform({ storage: cannotReadSettings() });

    await expect(getStorageUsage()).resolves.toEqual({ available: false });
  });
});

// The migration reads which per-key entries exist, then writes the gaps it found. A settings
// write landing inside that window reads as a gap and is reverted by the migration's own write.
describe('a settings write racing the migration', () => {
  it('outlives a migration write that lands after it', async () => {
    const { store, areas } = recordingStore({
      local: { [STORAGE_KEYS.SETTINGS]: legacyBlob({ theme: 'dark' }) },
    });
    let racingWrite: Promise<unknown> = Promise.resolve();
    configurePlatform({
      storage: {
        ...store,
        // Fires the write inside the window: the migration has its snapshot of the per-key
        // entries and has not written its patch yet.
        getMany: async (keys: string[], area: StorageArea) => {
          const seen = await store.getMany(keys, area);
          if (keys.includes(settingsStorageKey('theme'))) {
            racingWrite = setSettingsPatch({ theme: 'light' });
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          return seen;
        },
      },
    });

    await ensureSettingsMigrated();
    await racingWrite;

    expect(areas.local[settingsStorageKey('theme')]).toBe('light');
  });
});

// `getStorageArea` awaits this on nearly every storage call, so a memoized rejection would
// fail every read and write in the realm for the rest of the session.
describe('ensureSettingsMigrated', () => {
  it('retries after a failure rather than poisoning every later storage call', async () => {
    const { store } = recordingStore({
      local: { [STORAGE_KEYS.SETTINGS]: legacyBlob({ theme: 'dark' }) },
    });
    let failNextRead = true;
    configurePlatform({
      storage: {
        ...store,
        getMany: async (keys: string[], area: StorageArea) => {
          if (failNextRead) {
            failNextRead = false;
            throw new Error('storage unavailable');
          }
          return store.getMany(keys, area);
        },
      },
    });

    await expect(ensureSettingsMigrated()).rejects.toThrow('storage unavailable');

    await expect(getSettings()).resolves.toMatchObject({ theme: 'dark' });
  });

  // Nothing was copied after a failed write, so the memo must not report the move done.
  it('runs the migration again for the next reader when the write failed', async () => {
    const { store, areas } = recordingStore({
      local: { [STORAGE_KEYS.SETTINGS]: legacyBlob({ theme: 'dark' }) },
    });
    let writesFail = true;
    configurePlatform({
      storage: {
        ...store,
        setMany: async (entries: Record<string, unknown>, area: StorageArea) => {
          if (writesFail) {
            return {
              success: false as const,
              error: { type: 'quota_exceeded' as const, message: 'Storage full' },
            };
          }
          return store.setMany(entries, area);
        },
      },
    });

    await ensureSettingsMigrated();
    writesFail = false;
    await ensureSettingsMigrated();

    expect(areas.local[settingsStorageKey('theme')]).toBe('dark');
    expect(areas.local[STORAGE_KEYS.SETTINGS_MIGRATED]).toBe(true);
  });
});

describe('getSettingsForSync', () => {
  beforeEach(() => {
    const { store } = recordingStore();
    configurePlatform({ storage: store });
  });

  it('runs the pending migration, so a legacy value is pushed instead of our default', async () => {
    await setInStorage(STORAGE_KEYS.SETTINGS, legacyBlob({ theme: 'dark' }), 'local');

    await expect(getSettingsForSync()).resolves.toMatchObject({ theme: 'dark' });
  });

  // Unjudged on purpose: defaulting a peer's value here would make LWW push our default over
  // the newer value that peer actually chose.
  it('hands sync a stored value this build cannot parse, where the read defaults it', async () => {
    await setSettingsPatchRaw({ colorTheme: 'aurora' as never });

    await expect(getSettingsForSync()).resolves.toMatchObject({ colorTheme: 'aurora' });
    await expect(getSettings()).resolves.toMatchObject({
      colorTheme: DEFAULT_SETTINGS.colorTheme,
    });
  });
});

describe('storage area routing', () => {
  // A sync user whose blob has not migrated yet: nothing here calls the migration, exactly like
  // a page that loads #goals or hydrates quotes before the settings store.
  function unmigratedSyncUser(syncData: Record<string, unknown>) {
    return recordingStore({
      local: { [STORAGE_KEYS.SETTINGS]: legacyBlob({ syncEnabled: true }) },
      sync: syncData,
    });
  }

  it('reads collections from the sync area before anything has run the migration', async () => {
    const goals = goalFactory.buildList(2);
    const { store } = unmigratedSyncUser({ [STORAGE_KEYS.GOALS]: goals });
    configurePlatform({ storage: store });

    await expect(getGoals()).resolves.toEqual(goals);
  });

  it('reads collections from the local area for a user who never enabled sync', async () => {
    const goals = goalFactory.buildList(2);
    const { store } = recordingStore({ local: { [STORAGE_KEYS.GOALS]: goals } });
    configurePlatform({ storage: store });

    await expect(getGoals()).resolves.toEqual(goals);
  });
});

// The macOS app ships on this adapter, and getStorageArea throws rather than guess an area — so
// a single unparseable entry failing the whole batch takes every read down, across restarts.
describe('one unreadable settings entry on the localStorage backend', () => {
  it('costs its own field, not every setting and not the storage area', async () => {
    localStorage.clear();
    configurePlatform({ storage: new LocalStorageKeyValueStore() });
    localStorage.setItem(settingsStorageKey('theme'), '{not json');
    localStorage.setItem(settingsStorageKey('colorTheme'), JSON.stringify('forest'));
    localStorage.setItem(settingsStorageKey('syncEnabled'), JSON.stringify(true));
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(getSettings()).resolves.toMatchObject({
      theme: DEFAULT_SETTINGS.theme,
      colorTheme: 'forest',
      syncEnabled: true,
    });
    await expect(getStorageUsage()).resolves.toMatchObject({ available: true });
    localStorage.clear();
  });

  // End to end through the real adapter: a corrupt `syncEnabled` answered as "never written"
  // routes a sync user to the local area, where the cycle reads their data as empty and seals
  // a tombstone for every entity on every other device.
  it('refuses the storage area when syncEnabled itself is the corrupt entry', async () => {
    localStorage.clear();
    configurePlatform({ storage: new LocalStorageKeyValueStore() });
    localStorage.setItem(settingsStorageKey('syncEnabled'), '{not json');
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(getGoals()).rejects.toThrow(/storage area/i);
    localStorage.clear();
  });
});

// Stored-but-unreadable is not "never written". Answering it as absence is what makes a caller
// default `syncEnabled` to false, read a sync user's data as empty, and push our defaults out.
describe('a settings value that is stored but unreadable', () => {
  function unreadableSettingsKey(
    key: string,
    initial: Partial<Record<StorageArea, Record<string, unknown>>> = {}
  ): KeyValueStore {
    const { store } = recordingStore(initial);
    return {
      ...store,
      getMany: async (keys: string[], area: StorageArea) => {
        const seen = await store.getMany(keys, area);
        if (seen !== null && keys.includes(key)) {
          seen[key] = UNREADABLE_VALUE;
        }
        return seen;
      },
    };
  }

  it('leaves the storage area unanswered rather than guessing local', async () => {
    configurePlatform({
      storage: unreadableSettingsKey(settingsStorageKey('syncEnabled'), {
        sync: { [STORAGE_KEYS.GOALS]: goalFactory.buildList(2) },
      }),
    });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(getGoals()).rejects.toThrow(/storage area/i);
  });

  it('refuses to push settings with an unreadable field', async () => {
    configurePlatform({ storage: unreadableSettingsKey(settingsStorageKey('theme')) });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(getSettingsForSync()).rejects.toThrow(/unreadable/i);
  });

  // Display is the one place defaulting is right: the rest of the screen must still render.
  it('getSettings defaults that field alone', async () => {
    configurePlatform({
      storage: unreadableSettingsKey(settingsStorageKey('theme'), {
        local: { [settingsStorageKey('colorTheme')]: 'forest' },
      }),
    });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(getSettings()).resolves.toMatchObject({
      theme: DEFAULT_SETTINGS.theme,
      colorTheme: 'forest',
    });
  });

  it('names the field it defaulted', async () => {
    configurePlatform({ storage: unreadableSettingsKey(settingsStorageKey('theme')) });
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await getSettings();

    expect(error).toHaveBeenCalledWith(expect.stringContaining('unreadable'), {
      fields: ['theme'],
    });
  });

  // The gate path, not the display path: defaulting autoRollDueTasks to on re-dates every
  // overdue task of a user who turned it off, and pushes that to every other device.
  it('readSettings refuses, naming the field, rather than defaulting it', async () => {
    configurePlatform({
      storage: unreadableSettingsKey(settingsStorageKey('autoRollDueTasks')),
    });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(readSettings()).resolves.toEqual({
      ok: false,
      unreadable: ['autoRollDueTasks'],
    });
  });
});

// Nothing reads the blob any more, so an unreadable one blocks the migration instead: the values
// it holds were never copied out, and absence cannot yet be read as a default.
describe('a legacy settings blob that is stored but unreadable', () => {
  function unreadableBlob(
    initial: Partial<Record<StorageArea, Record<string, unknown>>> = {}
  ): KeyValueStore {
    const { store } = recordingStore({
      ...initial,
      local: { [STORAGE_KEYS.SETTINGS]: legacyBlob({}), ...initial.local },
    });
    return {
      ...store,
      // Presence, not the requested key: a blob a reset has deleted is absent, not unreadable.
      getMany: async (keys: string[], area: StorageArea) => {
        const seen = await store.getMany(keys, area);
        if (seen !== null && seen[STORAGE_KEYS.SETTINGS] !== undefined) {
          seen[STORAGE_KEYS.SETTINGS] = UNREADABLE_VALUE;
        }
        return seen;
      },
    };
  }

  it('leaves the storage area unanswered rather than guessing local', async () => {
    configurePlatform({
      storage: unreadableBlob({ sync: { [STORAGE_KEYS.GOALS]: goalFactory.buildList(2) } }),
    });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(getGoals()).rejects.toThrow(/storage area/i);
  });

  it('readSettings refuses rather than defaulting the fields it never copied', async () => {
    configurePlatform({ storage: unreadableBlob() });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(readSettings()).resolves.toMatchObject({
      ok: false,
      unreadable: expect.arrayContaining(['autoRollDueTasks']),
    });
  });

  // The blob is what blocks the migration, so deleting it is the way out — clearSettings removes
  // it, and the next run reads a fresh install.
  it('recovers once a reset has deleted the unreadable blob', async () => {
    configurePlatform({ storage: unreadableBlob() });
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    await expect(clearSettings()).resolves.toBe(true);
    resetSettingsMigration();

    await expect(readSettings()).resolves.toMatchObject({ ok: true });
  });

  it('keeps a per-key value that does not depend on the blob', async () => {
    configurePlatform({
      storage: unreadableBlob({ local: { [settingsStorageKey('colorTheme')]: 'forest' } }),
    });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(getSettings()).resolves.toMatchObject({ colorTheme: 'forest' });
  });

  // The flag says the copy already happened, so an absent per-key entry is a real default and the
  // bytes left behind cannot take the storage area down with them.
  it('answers the storage area anyway once the migration is flagged', async () => {
    const goals = goalFactory.buildList(2);
    configurePlatform({
      storage: unreadableBlob({
        local: { [STORAGE_KEYS.SETTINGS_MIGRATED]: true, [STORAGE_KEYS.GOALS]: goals },
      }),
    });

    await expect(getGoals()).resolves.toEqual(goals);
  });
});

describe('readSettings', () => {
  it('says so when the read failed, rather than leaving no trace at all', async () => {
    const { store } = recordingStore();
    configurePlatform({ storage: { ...store, getMany: async () => null } });
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(readSettings()).resolves.toMatchObject({ ok: false });

    expect(error).toHaveBeenCalledWith(expect.stringContaining('Could not read'));
  });
});

// Reset has to reach a key this build cannot name: the migration carries unknown keys across and
// sync writes whatever a newer peer sends, so a build-time list leaves them to resurface.
describe('clearSettings', () => {
  it('removes a settings key this build does not know about', async () => {
    const { store, areas } = recordingStore({
      local: {
        [settingsStorageKey('theme')]: 'dark',
        [settingsStorageKey('fromANewerBuild')]: 'kept forever',
      },
    });
    configurePlatform({ storage: store });

    await expect(clearSettings()).resolves.toBe(true);

    expect(areas.local[settingsStorageKey('fromANewerBuild')]).toBeUndefined();
    expect(areas.local[settingsStorageKey('theme')]).toBeUndefined();
  });

  // The flag lives outside the `settings.` prefix the reset enumerates: cleared with the rest,
  // the migration would re-run against the surviving blob and restore what the user just reset.
  it('keeps the migration flag through a reset that cannot delete the blob', async () => {
    const { store, areas } = recordingStore();
    configurePlatform({
      storage: {
        ...store,
        removeMany: async (keys: string[], area: StorageArea) =>
          store.removeMany(
            keys.filter((key) => key !== STORAGE_KEYS.SETTINGS),
            area
          ),
      },
    });
    await setInStorage(STORAGE_KEYS.SETTINGS, legacyBlob({ theme: 'dark' }), 'local');
    await ensureSettingsMigrated();

    await expect(clearSettings()).resolves.toBe(true);
    resetSettingsMigration();

    expect(areas.local[STORAGE_KEYS.SETTINGS_MIGRATED]).toBe(true);
    await expect(getSettings()).resolves.toMatchObject({ theme: DEFAULT_SETTINGS.theme });
  });

  it('reports failure instead of claiming a reset it could not enumerate', async () => {
    const { store, areas } = recordingStore({
      local: { [settingsStorageKey('theme')]: 'dark' },
    });
    configurePlatform({ storage: { ...store, keys: async () => null } });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(clearSettings()).resolves.toBe(false);

    expect(areas.local[settingsStorageKey('theme')]).toBe('dark');
  });
});

// Pinned directly because the insights-store export mock reimplements this predicate: narrowing
// the original to `isCustom` alone would leave that suite green while a favourited quote silently
// vanished from a "complete" export.
describe('isCustomQuote', () => {
  it.each([
    ['user-created', { isCustom: true }],
    ['a favourited seed quote', { isFavorite: true }],
    ['a hidden seed quote', { isHidden: true }],
  ])("treats %s as the user's", (_label, overrides) => {
    expect(isCustomQuote(quoteFactory.build({ isCustom: false, ...overrides }))).toBe(true);
  });

  it('leaves an untouched seed quote with the seed set', () => {
    const seed = quoteFactory.build({ isCustom: false, isFavorite: false, isHidden: false });

    expect(isCustomQuote(seed)).toBe(false);
  });
});
