import { configurePlatform, type SyncMutationSink } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectBackgroundBlur, selectBackgroundDim, useSettingsStore } from './settings-store';

vi.mock('@cuewise/storage', () => ({
  getSettings: vi.fn(),
  setSettings: vi.fn(),
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
    vi.mocked(storage.setSettings).mockResolvedValue({ success: true });
    vi.mocked(storage.migrateStorageData).mockResolvedValue({ success: true });
    configurePlatform({ syncSink: fakeSink });
  });

  afterEach(() => {
    configurePlatform({ syncSink: null });
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

  it('notifies markMutated with "theme" after updateTheme persists', async () => {
    await useSettingsStore.getState().updateTheme('dark');

    expect(markMutated).toHaveBeenCalledWith('settings', 'theme');
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
    vi.mocked(storage.setSettings).mockResolvedValue({ success: true });
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
    expect(storage.setSettings).not.toHaveBeenCalled();
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
    expect(storage.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundDim: 40 })
    );
    expect(markMutated).toHaveBeenCalledWith('settings', 'backgroundDim');
    expect(useSettingsStore.getState().preview).toBeNull();
  });

  it('clearPreview discards the overlay without persisting anything', () => {
    useSettingsStore.getState().previewSettings({ backgroundDim: 40 });
    useSettingsStore.getState().clearPreview();

    expect(useSettingsStore.getState().preview).toBeNull();
    expect(storage.setSettings).not.toHaveBeenCalled();
  });

  it('a failed persist surfaces the error, keeps persisted truth, and clears the preview', async () => {
    vi.mocked(storage.setSettings).mockResolvedValue({
      success: false,
      error: { type: 'quota_exceeded', message: 'quota exceeded' },
    });
    useSettingsStore.getState().previewSettings({ backgroundDim: 40 });

    const persisted = await useSettingsStore.getState().updateSettings({ backgroundDim: 40 });

    const state = useSettingsStore.getState();
    expect(persisted).toBe(false);
    expect(state.preview).toBeNull();
    expect(state.error).toBe('Failed to update settings. Please try again.');
    expect(state.settings.backgroundDim).toBe(0);
    expect(markMutated).not.toHaveBeenCalled();
  });

  it('updateSettings clamps background values to their bounds before persisting', async () => {
    await useSettingsStore.getState().updateSettings({
      backgroundDim: 500,
      backgroundBlur: -3,
      pomodoroWorkDuration: 999,
    });

    expect(storage.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundDim: 100, backgroundBlur: 0, pomodoroWorkDuration: 60 })
    );
  });

  it('a failed sync migration clears the preview alongside surfacing the error', async () => {
    vi.mocked(storage.migrateStorageData).mockResolvedValue({
      success: false,
      error: { type: 'quota_exceeded', message: 'quota exceeded' },
    });
    useSettingsStore.getState().previewSettings({ backgroundDim: 40 });

    await useSettingsStore.getState().updateSettings({ syncEnabled: true });

    expect(useSettingsStore.getState().preview).toBeNull();
    expect(useSettingsStore.getState().error).toContain('Cannot enable sync');
    expect(useSettingsStore.getState().settings.syncEnabled).toBe(defaultSettings.syncEnabled);
  });

  it('resetToDefaults clears a lingering preview', async () => {
    useSettingsStore.getState().previewSettings({ backgroundDim: 40 });
    await useSettingsStore.getState().resetToDefaults();

    expect(useSettingsStore.getState().preview).toBeNull();
  });

  it('a failed reset write surfaces the error instead of claiming defaults', async () => {
    vi.mocked(storage.setSettings).mockResolvedValue({
      success: false,
      error: { type: 'unknown', message: 'write failed' },
    });
    useSettingsStore.setState({ settings: { ...defaultSettings, backgroundDim: 30 } });

    const persisted = await useSettingsStore.getState().resetToDefaults();

    const state = useSettingsStore.getState();
    expect(persisted).toBe(false);
    expect(state.error).toBe('Failed to reset settings. Please try again.');
    expect(state.settings.backgroundDim).toBe(30);
    expect(markMutated).not.toHaveBeenCalled();
  });
});
