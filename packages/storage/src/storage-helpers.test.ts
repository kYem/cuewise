import {
  configurePlatform,
  DEFAULT_SETTINGS,
  type KeyValueStore,
  logger,
  type Settings,
  STORAGE_KEYS,
  type StorageArea,
  type StorageUsage,
  type SyncMutationSink,
} from '@cuewise/shared';
import { goalFactory } from '@cuewise/test-utils/factories';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFromStorage, getManyFromStorage, setInStorage } from './chrome-storage';
import {
  clearCustomBackground,
  clearSettings,
  ensureSettingsMigrated,
  getCustomBackground,
  getGoals,
  getSettings,
  getSettingsForSync,
  getStorageUsage,
  migrateLegacySettings,
  readLegacySettingsBlob,
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
    setMany: async () => ({ success: true }),
    removeMany: async () => true,
    getUsage: async () => usage,
  };
}

describe('getStorageUsage', () => {
  it('computes percentage and flags a warning above 75%', async () => {
    configurePlatform({ storage: fakeStore({ bytesInUse: 8_000_000, quota: 10_000_000 }) });

    const info = await getStorageUsage();

    expect(info.percentageUsed).toBe(80);
    expect(info.isWarning).toBe(true);
    expect(info.isCritical).toBe(false);
  });

  it('flags critical above 90%', async () => {
    configurePlatform({ storage: fakeStore({ bytesInUse: 9_500_000, quota: 10_000_000 }) });

    const info = await getStorageUsage();

    expect(info.isCritical).toBe(true);
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
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in areas[area]) {
          result[key] = areas[area][key];
        }
      }
      return result;
    },
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

    const stored = await getManyFromStorage(SETTINGS_KEYS.map(settingsStorageKey));

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
    expect(stored).toEqual({ 'settings.theme': 'dark' });
  });

  it('does not overwrite a per-key value that landed before it ran', async () => {
    await setInStorage(STORAGE_KEYS.SETTINGS, legacyBlob({ theme: 'dark' }), 'local');
    await setSettingsPatch({ theme: 'light' });

    await migrateLegacySettings();

    const settings = await getSettings();
    expect(settings.theme).toBe('light');
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

  it('deletes the legacy blob once migrated', async () => {
    await setInStorage(STORAGE_KEYS.SETTINGS, legacyBlob({ theme: 'dark' }), 'local');

    await migrateLegacySettings();

    expect(await readLegacySettingsBlob()).toBeNull();
  });

  it('does nothing when there is no legacy blob', async () => {
    await migrateLegacySettings();

    const stored = await getManyFromStorage(SETTINGS_KEYS.map(settingsStorageKey));
    expect(stored).toEqual({});
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
    expect(stored).toEqual({ 'settings.quoteFilterActiveCollectionIds': ['c1'] });
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
    expect(await getManyFromStorage([settingsStorageKey('constructor')])).toEqual({
      [settingsStorageKey('constructor')]: 'from-a-newer-build',
    });
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
        get: async <T>(key: string, area: StorageArea): Promise<T | null> => {
          if (failNextRead) {
            failNextRead = false;
            throw new Error('storage unavailable');
          }
          return store.get<T>(key, area);
        },
      },
    });

    await expect(ensureSettingsMigrated()).rejects.toThrow('storage unavailable');

    await expect(getSettings()).resolves.toMatchObject({ theme: 'dark' });
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
