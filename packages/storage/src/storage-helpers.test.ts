import {
  configurePlatform,
  DEFAULT_SETTINGS,
  type KeyValueStore,
  type Settings,
  STORAGE_KEYS,
  type StorageUsage,
} from '@cuewise/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { getManyFromStorage, setInStorage } from './chrome-storage';
import {
  clearCustomBackground,
  clearSettings,
  getCustomBackground,
  getSettings,
  getStorageUsage,
  getStoredSettings,
  migrateLegacySettings,
  SETTINGS_KEYS,
  setCustomBackground,
  setSettingsPatch,
  settingsStorageKey,
} from './storage-helpers';

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
function recordingStore(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial };
  const store: KeyValueStore = {
    supportsSync: true,
    get: async <T>(key: string) => (data[key] ?? null) as T | null,
    set: async <T>(key: string, value: T) => {
      data[key] = value;
      return { success: true } as const;
    },
    remove: async (key: string) => {
      delete data[key];
      return true;
    },
    getMany: async (keys: string[]) => {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in data) {
          result[key] = data[key];
        }
      }
      return result;
    },
    setMany: async (entries: Record<string, unknown>) => {
      Object.assign(data, entries);
      return { success: true };
    },
    removeMany: async (keys: string[]) => {
      for (const key of keys) {
        delete data[key];
      }
      return true;
    },
    getUsage: async () => ({ bytesInUse: 0, quota: 10_000_000 }),
  };
  return { store, data };
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

  it('clearSettings removes every settings key so defaults apply again', async () => {
    const { store } = recordingStore();
    configurePlatform({ storage: store });

    await setSettingsPatch({ showClock: true, theme: 'dark' });

    await clearSettings();

    const settings = await getSettings();
    expect(settings.showClock).toBe(DEFAULT_SETTINGS.showClock);
    expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
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

describe('migrateLegacySettings', () => {
  // A prior describe block may leave the platform pointed at its own recordingStore
  // (each test there reconfigures it but nothing restores the default afterward) —
  // start every test here from a fresh store so runs don't depend on file order.
  beforeEach(() => {
    const { store } = recordingStore();
    configurePlatform({ storage: store });
  });

  // structuredClone, not a spread: the fake store keeps whatever reference it's given, so a
  // shallow spread would leave every untouched array field pointing at the exact same
  // DEFAULT_SETTINGS array instance. Real chrome.storage always round-trips through
  // serialization and never hands back that instance, so this reproduces the case that
  // actually distinguishes a structural default-comparison from a reference one.
  function legacyBlob(overrides: Partial<Settings>): Settings {
    return { ...structuredClone(DEFAULT_SETTINGS), ...overrides };
  }

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

    expect(await getStoredSettings()).toEqual(blob);
  });

  it('deletes the legacy blob once migrated', async () => {
    await setInStorage(STORAGE_KEYS.SETTINGS, legacyBlob({ theme: 'dark' }), 'local');

    await migrateLegacySettings();

    expect(await getStoredSettings()).toBeNull();
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
});
