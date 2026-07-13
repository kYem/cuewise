import * as storage from '@cuewise/storage';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from './settings-store';
import { type SyncMutationSink, setSyncEngine } from './sync-hook';

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

describe('sync-hook wiring', () => {
  const markMutated = vi.fn();
  const fakeSink: SyncMutationSink = { markMutated, markDeleted: vi.fn() };

  beforeEach(() => {
    useSettingsStore.setState({ settings: defaultSettings, isLoading: false, error: null });
    vi.clearAllMocks();
    markMutated.mockClear();
    vi.mocked(storage.setSettings).mockResolvedValue({ success: true });
    vi.mocked(storage.migrateStorageData).mockResolvedValue({ success: true });
    setSyncEngine(fakeSink);
  });

  afterEach(() => {
    setSyncEngine(null);
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
