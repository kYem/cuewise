import {
  configurePlatform,
  DEFAULT_SETTINGS,
  logger,
  type Settings,
  type StorageResult,
  type SyncMutationSink,
  storageFailure,
} from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectBackgroundBlur, selectBackgroundDim, useSettingsStore } from './settings-store';

vi.mock('@cuewise/storage', () => ({
  getSettings: vi.fn(),
  getSettingsOrNull: vi.fn(),
  setSettingsPatch: vi.fn(),
  clearSettings: vi.fn(),
  migrateStorageData: vi.fn(),
}));

vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({
      error: vi.fn(),
      warning: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

// jsdom has no matchMedia; resetToDefaults applies the default 'auto' theme, which reads it.
vi.stubGlobal(
  'matchMedia',
  vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
);

// storedSettings models the effective value getSettings() returns (defaults merged with
// whatever's present) — a patch updates only its own keys and leaves the rest untouched,
// and clearing drops back to pure defaults, mirroring the real sparse per-key store.
let storedSettings: Settings = defaultSettings;

function seedStorage(settings: Settings = defaultSettings) {
  storedSettings = settings;
  vi.mocked(storage.getSettings).mockImplementation(async () => storedSettings);
  vi.mocked(storage.getSettingsOrNull).mockImplementation(async () => storedSettings);
  vi.mocked(storage.setSettingsPatch).mockImplementation(async (patch: Partial<Settings>) => {
    storedSettings = { ...storedSettings, ...patch };
    return { success: true };
  });
  vi.mocked(storage.clearSettings).mockImplementation(async () => {
    storedSettings = DEFAULT_SETTINGS;
    return true;
  });
}

describe('sync sink wiring', () => {
  const markMutated = vi.fn();
  const fakeSink: SyncMutationSink = { markMutated, markDeleted: vi.fn() };

  beforeEach(() => {
    useSettingsStore.setState({
      settings: defaultSettings,
      preview: null,
      isLoading: false,
      error: null,
    });
    vi.clearAllMocks();
    markMutated.mockClear();
    seedStorage();
    vi.mocked(storage.migrateStorageData).mockResolvedValue({ success: true });
    configurePlatform({ syncSink: fakeSink });
  });

  afterEach(() => {
    configurePlatform({ syncSink: null });
  });

  it('initialize migrates without marking any key dirty', async () => {
    await useSettingsStore.getState().initialize();

    expect(markMutated).not.toHaveBeenCalled();
  });

  it('notifies markMutated for each changed, non-device-local key after updateSettings persists', async () => {
    await useSettingsStore.getState().updateSettings({ showClock: true, colorTheme: 'forest' });

    expect(markMutated).toHaveBeenCalledWith('settings', 'showClock');
    expect(markMutated).toHaveBeenCalledWith('settings', 'colorTheme');
  });

  it('does not notify for device-local keys (syncEnabled, cloudSyncEnabled, logLevel, focusedGoalId, hasSeenOnboarding)', async () => {
    await useSettingsStore.getState().updateSettings({
      syncEnabled: true,
      logLevel: 'debug',
      focusedGoalId: 'g1',
      hasSeenOnboarding: true,
    });

    expect(markMutated).not.toHaveBeenCalled();
  });

  it('does not notify a key whose value did not actually change', async () => {
    await useSettingsStore.getState().updateSettings({ showClock: defaultSettings.showClock });

    expect(markMutated).not.toHaveBeenCalledWith('settings', 'showClock');
  });

  it('notifies markMutated with "theme" after a theme write persists', async () => {
    await useSettingsStore.getState().updateSettings({ theme: 'dark' });

    expect(markMutated).toHaveBeenCalledWith('settings', 'theme');
  });

  it('does not notify when the selected theme is already active', async () => {
    await useSettingsStore.getState().updateSettings({ theme: defaultSettings.theme });

    expect(markMutated).not.toHaveBeenCalledWith('settings', 'theme');
  });
});

describe('background preview lifecycle', () => {
  const markMutated = vi.fn();
  const fakeSink: SyncMutationSink = { markMutated, markDeleted: vi.fn() };

  beforeEach(() => {
    useSettingsStore.setState({
      settings: defaultSettings,
      preview: null,
      isLoading: false,
      error: null,
    });
    vi.clearAllMocks();
    seedStorage();
    vi.mocked(storage.migrateStorageData).mockResolvedValue({ success: true });
    configurePlatform({ syncSink: fakeSink });
  });

  afterEach(() => {
    configurePlatform({ syncSink: null });
  });

  it('previewSettings overlays values without touching persisted settings or sync', () => {
    useSettingsStore.getState().previewSettings({ backgroundDim: 40, backgroundBlur: 8 });

    expect(useSettingsStore.getState().preview).toEqual({ backgroundDim: 40, backgroundBlur: 8 });
    expect(useSettingsStore.getState().settings.backgroundDim).toBe(0);
    expect(storage.setSettingsPatch).not.toHaveBeenCalled();
    expect(markMutated).not.toHaveBeenCalled();
  });

  it('background selectors prefer preview values over persisted settings', () => {
    useSettingsStore.getState().previewSettings({ backgroundBlur: 12 });

    const state = useSettingsStore.getState();
    expect(selectBackgroundBlur(state)).toBe(12);
    expect(selectBackgroundDim(state)).toBe(0);
  });

  it('selectors honor a preview of zero over a nonzero persisted value', () => {
    useSettingsStore.setState({ settings: { ...defaultSettings, backgroundDim: 30 } });
    useSettingsStore.getState().previewSettings({ backgroundDim: 0 });

    expect(selectBackgroundDim(useSettingsStore.getState())).toBe(0);
  });

  it('updateSettings persists, notifies sync, and clears the preview on commit', async () => {
    useSettingsStore.getState().previewSettings({ backgroundDim: 40 });
    const persisted = await useSettingsStore.getState().updateSettings({ backgroundDim: 40 });

    expect(persisted).toBe(true);
    expect(storage.setSettingsPatch).toHaveBeenCalledWith({ backgroundDim: 40 });
    expect(markMutated).toHaveBeenCalledWith('settings', 'backgroundDim');
    expect(useSettingsStore.getState().preview).toBeNull();
  });

  it('clearPreview discards the overlay without persisting anything', () => {
    useSettingsStore.getState().previewSettings({ backgroundDim: 40 });
    useSettingsStore.getState().clearPreview();

    expect(useSettingsStore.getState().preview).toBeNull();
    expect(storage.setSettingsPatch).not.toHaveBeenCalled();
  });

  it('a failed persist surfaces the error, keeps persisted truth, and clears the preview', async () => {
    vi.mocked(storage.setSettingsPatch).mockResolvedValue({
      success: false,
      error: { type: 'quota_exceeded', message: 'quota exceeded' },
    });
    useSettingsStore.getState().previewSettings({ backgroundDim: 40 });

    const persisted = await useSettingsStore.getState().updateSettings({ backgroundDim: 40 });

    const state = useSettingsStore.getState();
    expect(persisted).toBe(false);
    expect(state.preview).toBeNull();
    expect(state.error).toBe(
      'Storage is full — could not save settings. Clear some data to continue.'
    );
    expect(state.settings.backgroundDim).toBe(0);
    expect(markMutated).not.toHaveBeenCalled();
  });

  it('a successful unrelated write leaves a live background preview untouched', async () => {
    useSettingsStore.getState().previewSettings({ backgroundDim: 55 });

    await useSettingsStore.getState().updateSettings({ showClock: true });

    expect(useSettingsStore.getState().preview).toEqual({ backgroundDim: 55 });
  });

  it('a resolving commit keeps a newer preview made while it was in flight', async () => {
    useSettingsStore.getState().previewSettings({ backgroundDim: 1 });
    const pending = useSettingsStore.getState().updateSettings({ backgroundDim: 1 });
    useSettingsStore.getState().previewSettings({ backgroundDim: 2 });

    await pending;

    expect(useSettingsStore.getState().preview).toEqual({ backgroundDim: 2 });
  });

  it('updateSettings clamps background values to their bounds before persisting', async () => {
    await useSettingsStore.getState().updateSettings({
      backgroundDim: 500,
      backgroundBlur: -3,
      pomodoroWorkDuration: 999,
    });

    expect(storage.setSettingsPatch).toHaveBeenCalledWith({
      backgroundDim: 100,
      backgroundBlur: 0,
      pomodoroWorkDuration: 60,
    });
  });

  it('a failed sync migration clears the preview alongside surfacing the error', async () => {
    vi.mocked(storage.migrateStorageData).mockResolvedValue({
      success: false,
      error: { type: 'quota_exceeded', message: 'quota exceeded' },
    });
    useSettingsStore.getState().previewSettings({ backgroundDim: 40 });

    const persisted = await useSettingsStore.getState().updateSettings({ syncEnabled: true });

    expect(persisted).toBe(false);
    expect(useSettingsStore.getState().preview).toBeNull();
    expect(useSettingsStore.getState().error).toContain('Cannot enable sync');
    expect(useSettingsStore.getState().settings.syncEnabled).toBe(defaultSettings.syncEnabled);
  });

  it('resetToDefaults clears a lingering preview', async () => {
    useSettingsStore.getState().previewSettings({ backgroundDim: 40 });
    const persisted = await useSettingsStore.getState().resetToDefaults();

    expect(persisted).toBe(true);
    expect(useSettingsStore.getState().preview).toBeNull();
  });

  it('a failed reset write surfaces the error instead of claiming defaults', async () => {
    vi.mocked(storage.clearSettings).mockResolvedValue(false);
    useSettingsStore.setState({ settings: { ...defaultSettings, backgroundDim: 30 } });

    const persisted = await useSettingsStore.getState().resetToDefaults();

    const state = useSettingsStore.getState();
    expect(persisted).toBe(false);
    expect(state.error).toBe('Failed to reset settings. Please try again.');
    expect(state.settings.backgroundDim).toBe(30);
    expect(markMutated).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// setTimeout(0) drains the microtask queue; awaiting a bare Promise.resolve() only advances one tick.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('serialized write path', () => {
  const markMutated = vi.fn();
  const fakeSink: SyncMutationSink = { markMutated, markDeleted: vi.fn() };

  beforeEach(() => {
    useSettingsStore.setState({
      settings: defaultSettings,
      preview: null,
      isLoading: false,
      error: null,
    });
    vi.clearAllMocks();
    seedStorage();
    vi.mocked(storage.migrateStorageData).mockResolvedValue({ success: true });
    configurePlatform({ syncSink: fakeSink });
  });

  afterEach(() => {
    configurePlatform({ syncSink: null });
  });

  it('persists only the keys in the patch', async () => {
    await useSettingsStore.getState().updateSettings({ showClock: true });

    expect(storage.setSettingsPatch).toHaveBeenCalledWith({ showClock: true });
  });

  it('resetToDefaults clears the stored keys rather than writing defaults', async () => {
    await useSettingsStore.getState().resetToDefaults();

    expect(storage.clearSettings).toHaveBeenCalled();
    expect(storage.setSettingsPatch).not.toHaveBeenCalled();
  });

  it('keeps both patches when two writes overlap', async () => {
    const firstWrite = deferred<StorageResult>();
    vi.mocked(storage.setSettingsPatch).mockImplementationOnce(async (patch: Partial<Settings>) => {
      const result = await firstWrite.promise;
      storedSettings = { ...storedSettings, ...patch };
      return result;
    });

    const first = useSettingsStore.getState().updateSettings({ showClock: true });
    const second = useSettingsStore.getState().updateSettings({ colorTheme: 'forest' });
    firstWrite.resolve({ success: true });
    await Promise.all([first, second]);

    // Each write persists only its own patch — the queue orders them, it never merges them
    // into one storage write.
    expect(storage.setSettingsPatch).toHaveBeenNthCalledWith(1, { showClock: true });
    expect(storage.setSettingsPatch).toHaveBeenNthCalledWith(2, { colorTheme: 'forest' });
    const { settings } = useSettingsStore.getState();
    expect(settings.showClock).toBe(true);
    expect(settings.colorTheme).toBe('forest');
  });

  it('does not start the next write until the in-flight one resolves', async () => {
    const firstWrite = deferred<StorageResult>();
    vi.mocked(storage.setSettingsPatch).mockImplementationOnce(async (patch: Partial<Settings>) => {
      const result = await firstWrite.promise;
      storedSettings = { ...storedSettings, ...patch };
      return result;
    });

    const first = useSettingsStore.getState().updateSettings({ showClock: true });
    const second = useSettingsStore.getState().updateSettings({ colorTheme: 'forest' });
    await flush();

    expect(storage.setSettingsPatch).toHaveBeenCalledTimes(1);

    firstWrite.resolve({ success: true });
    await Promise.all([first, second]);

    expect(storage.setSettingsPatch).toHaveBeenCalledTimes(2);
  });

  it('notifies each overlapping write for its own changed key', async () => {
    const firstWrite = deferred<StorageResult>();
    vi.mocked(storage.setSettingsPatch).mockImplementationOnce(async (patch: Partial<Settings>) => {
      const result = await firstWrite.promise;
      storedSettings = { ...storedSettings, ...patch };
      return result;
    });

    const first = useSettingsStore.getState().updateSettings({ showClock: true });
    const second = useSettingsStore.getState().updateSettings({ colorTheme: 'forest' });
    firstWrite.resolve({ success: true });
    await Promise.all([first, second]);

    expect(markMutated).toHaveBeenCalledWith('settings', 'showClock');
    expect(markMutated).toHaveBeenCalledWith('settings', 'colorTheme');
  });

  it('queues resetToDefaults behind an in-flight update', async () => {
    const firstWrite = deferred<StorageResult>();
    vi.mocked(storage.setSettingsPatch).mockImplementationOnce(async (patch: Partial<Settings>) => {
      const result = await firstWrite.promise;
      storedSettings = { ...storedSettings, ...patch };
      return result;
    });

    const update = useSettingsStore.getState().updateSettings({ showClock: true });
    const reset = useSettingsStore.getState().resetToDefaults();
    await flush();

    expect(storage.setSettingsPatch).toHaveBeenCalledTimes(1);
    expect(storage.clearSettings).not.toHaveBeenCalled();

    firstWrite.resolve({ success: true });
    await Promise.all([update, reset]);

    expect(storage.clearSettings).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().settings.showClock).toBe(DEFAULT_SETTINGS.showClock);
  });

  it('keeps serving later writes after one fails', async () => {
    vi.mocked(storage.setSettingsPatch).mockResolvedValueOnce(storageFailure('write failed'));

    const first = useSettingsStore.getState().updateSettings({ showClock: true });
    const second = useSettingsStore.getState().updateSettings({ colorTheme: 'forest' });

    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(useSettingsStore.getState().settings.colorTheme).toBe('forest');
  });

  it('merges onto persisted truth when the in-memory snapshot is stale', async () => {
    seedStorage({ ...defaultSettings, showClock: true });
    useSettingsStore.setState({ settings: defaultSettings });

    await useSettingsStore.getState().updateSettings({ colorTheme: 'forest' });

    // The write carries only the patch (colorTheme) — showClock never round-trips back to
    // storage even though it's part of the merged in-memory truth below.
    expect(storage.setSettingsPatch).toHaveBeenLastCalledWith({ colorTheme: 'forest' });
    expect(useSettingsStore.getState().settings.showClock).toBe(true);
  });

  it('applies a storage-only theme change that this write did not touch', async () => {
    seedStorage({ ...defaultSettings, theme: 'dark' });
    useSettingsStore.setState({ settings: { ...defaultSettings, theme: 'light' } });
    document.documentElement.classList.remove('dark');

    await useSettingsStore.getState().updateSettings({ showClock: true });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

// Defaults as the merge base read as the user's own choices: syncEnabled would come back false
// for a sync user, so toggling sync off would skip the area migration and still write the flag.
describe('an update whose read of the current settings failed', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: defaultSettings,
      preview: null,
      isLoading: false,
      error: null,
    });
    vi.clearAllMocks();
    seedStorage({ ...defaultSettings, syncEnabled: true });
    vi.mocked(storage.migrateStorageData).mockResolvedValue({ success: true });
    vi.mocked(storage.getSettingsOrNull).mockResolvedValue(null);
  });

  it('aborts instead of writing against defaults', async () => {
    await expect(useSettingsStore.getState().updateSettings({ syncEnabled: false })).resolves.toBe(
      false
    );

    expect(storage.setSettingsPatch).not.toHaveBeenCalled();
    expect(storage.migrateStorageData).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().error).not.toBeNull();
  });

  // Every sibling failure branch in updateSettings logs; without this the one abort that
  // silently drops the user's change is the only one with no record.
  it('logs the abort, naming the keys that were not saved', async () => {
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await useSettingsStore.getState().updateSettings({ theme: 'dark' });

    expect(logged).toHaveBeenCalledWith(expect.stringContaining('Aborted'), {
      fields: ['theme'],
    });
  });
});
